'use strict';
/**
 * server/lib/auth.cjs — sessions, cookies, and the API-wide auth gate.
 *
 * HOW IT PLUGS IN (one line in server/index.cjs, before any route mount):
 *
 *     require('./lib/auth.cjs').install(app);
 *
 * install() does three things, in order:
 *   1. app.use(cookieParser())                — read the session cookie
 *   2. app.use('/api/auth', authRouter)       — login/logout/me/change-password
 *   3. app.use('/api', authenticate, requireRole) — EVERYTHING ELSE under /api
 *      must carry a valid session, and the session's role must be allowed
 *      for that path. Routers mounted after this line are protected without
 *      touching their files.
 *
 * SESSIONS
 *   On login: 32 random bytes -> raw token goes in an httpOnly cookie,
 *   SHA-256(token) goes in the `sessions` table. A stolen DB dump cannot be
 *   replayed; a stolen cookie can be revoked by deleting the row.
 *   MLO sessions last 12 h, borrower sessions 30 days (Phase 2).
 *
 * PUBLIC PATHS (no session needed)
 *   /api/health          — deploy checks, the frontend's checkApi()
 *   /api/auth/login      — mounted before the gate
 *   /api/auth/logout     — same (clears whatever cookie is present)
 *   /api/invites/:token  — invite preview + accept (the token is the credential)
 *
 * ROLES BY PATH
 *   /api/apply/*   -> borrower
 *   everything else -> mlo
 *
 * COOKIE_SECURE
 *   Defaults on: the cookie is only sent over HTTPS, i.e. https://jammie-mlo.com.
 *   Opening the app on the bare http://IP will not keep you signed in — by
 *   design. Set COOKIE_SECURE=0 in .env only for a local dev server.
 */

const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const db           = require('../db.cjs');

const COOKIE_NAME      = 'jammie_session';
const MLO_TTL_MS       = 12 * 60 * 60 * 1000;
const BORROWER_TTL_MS  = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_COST      = 12;
const TOUCH_EVERY_MS   = 5 * 60 * 1000;   // how often last_seen_at is written

const PUBLIC = [
  /^\/api\/health\/?$/,
  /^\/api\/auth\/login\/?$/,
  /^\/api\/auth\/logout\/?$/,
  // Invite acceptance: the token IS the credential. Only these two shapes.
  /^\/api\/invites\/[A-Za-z0-9_-]{20,}\/?$/,          // GET  preview
  /^\/api\/invites\/[A-Za-z0-9_-]{20,}\/accept\/?$/,  // POST accept
];

const ROLE_BY_PREFIX = [
  ['/api/apply', ['borrower']],
];
const DEFAULT_ROLES = ['mlo'];

// ── helpers ─────────────────────────────────────────────────────────────
const sha256   = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const pathOf   = req => (req.originalUrl || req.url || '').split('?')[0];
const cookieSecure = () => (process.env.COOKIE_SECURE ?? '1') !== '0';
// nginx may send X-Forwarded-For (extended config) or only X-Real-IP (the
// original config). Accept either so rate limits and audit rows see the
// real client, not 127.0.0.1 for everyone.
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  || String(req.headers['x-real-ip'] || '').trim() || req.ip || 'unknown';

function initials(first, last) {
  return ((first || '')[0] || '').toUpperCase() + ((last || '')[0] || '').toUpperCase() || '?';
}

function publicUser(row) {
  // The shape the frontend keeps in state. Never includes the hash.
  return {
    type: 'mlo',
    id: row.id,
    email: row.email,
    username: row.username,
    firstName: row.first_nm,
    lastName: row.last_nm,
    name: [row.first_nm, row.last_nm].filter(Boolean).join(' ') || row.email,
    initials: initials(row.first_nm, row.last_nm),
    nmls: row.nmls_number || null,
    isAdmin: !!row.is_admin,
  };
}

function publicBorrower(row) {
  return {
    type: 'borrower',
    id: row.id,
    email: row.email,
    firstName: row.first_nm,
    lastName: row.last_nm,
    name: [row.first_nm, row.last_nm].filter(Boolean).join(' ') || row.email,
    initials: initials(row.first_nm, row.last_nm),
    lang: row.preferred_lang || 'en',
    isAdmin: false,
  };
}

// ── passwords ───────────────────────────────────────────────────────────
async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_COST);
}
async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), hash);
}
function validateNewPassword(p) {
  if (typeof p !== 'string' || p.length < 10) return 'Password must be at least 10 characters';
  if (p.length > 128) return 'Password must be 128 characters or fewer';
  return null;
}

// ── sessions ────────────────────────────────────────────────────────────
async function createSession(req, res, userType, userId) {
  const token   = newToken();
  const ttl     = userType === 'mlo' ? MLO_TTL_MS : BORROWER_TTL_MS;
  const expires = new Date(Date.now() + ttl);
  await db.query('INSERT INTO sessions SET ?', {
    user_type: userType, user_id: userId, token_hash: sha256(token),
    expires_at: expires, last_seen_at: new Date(),
    ip: clientIp(req), user_agent: String(req.headers['user-agent'] || '').slice(0, 255),
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', expires,
  });
  // Make the new session visible to the rest of THIS request (login returns
  // the resolved user). Without this, resolveSession would read the browser's
  // previous cookie — a stale or different account.
  req.cookies = { ...(req.cookies || {}), [COOKIE_NAME]: token };
  return token;
}

async function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) await db.query('DELETE FROM sessions WHERE token_hash=?', [sha256(token)]).catch(() => {});
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function destroyOtherSessions(userType, userId, keepToken) {
  await db.query('DELETE FROM sessions WHERE user_type=? AND user_id=? AND token_hash<>?',
    [userType, userId, sha256(keepToken || '')]);
}

/** Resolve the cookie to a user object, or null. Does not send a response. */
async function resolveSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  const [rows] = await db.query(
    'SELECT * FROM sessions WHERE token_hash=? AND expires_at > NOW() LIMIT 1', [sha256(token)]);
  const s = rows[0];
  if (!s) return null;

  let user = null;
  if (s.user_type === 'mlo') {
    const [u] = await db.query(
      'SELECT id, email, username, first_nm, last_nm, nmls_number, is_admin, is_active FROM mlo_users WHERE id=?', [s.user_id]);
    if (u[0] && u[0].is_active) user = publicUser(u[0]);
  } else if (s.user_type === 'borrower') {
    const [u] = await db.query('SELECT id, email, first_nm, last_nm, preferred_lang, is_active FROM borrower_users WHERE id=?', [s.user_id]);
    if (u[0] && u[0].is_active) user = publicBorrower(u[0]);
  }
  if (!user) return null;

  // Keep last_seen_at roughly current without a write on every request.
  const seen = s.last_seen_at ? new Date(s.last_seen_at).getTime() : 0;
  if (Date.now() - seen > TOUCH_EVERY_MS) {
    db.query('UPDATE sessions SET last_seen_at=NOW() WHERE id=?', [s.id]).catch(() => {});
  }
  user.sessionId = s.id;
  return user;
}

// ── middleware ──────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  try {
    const p = pathOf(req);
    if (PUBLIC.some(rx => rx.test(p))) return next();
    const user = await resolveSession(req);
    if (!user) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(401).json({ error: 'Not signed in' });
    }
    req.user = user;
    next();
  } catch (e) {
    console.error('[auth] authenticate failed:', e.message);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

function rolesFor(p) {
  for (const [prefix, roles] of ROLE_BY_PREFIX) if (p.startsWith(prefix)) return roles;
  return DEFAULT_ROLES;
}

function requireRole(req, res, next) {
  const p = pathOf(req);
  if (PUBLIC.some(rx => rx.test(p))) return next();
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (!rolesFor(p).includes(req.user.type)) return res.status(403).json({ error: 'Not allowed for this account type' });
  next();
}

/** For use inside routers mounted BEFORE the gate (e.g. /api/auth/me). */
const requireSession = [authenticate, (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Not signed in' }))];

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10,
  // Count failures only: several MLOs behind one office IP signing in
  // normally must not lock each other out.
  skipSuccessfulRequests: true,
  keyGenerator: req => clientIp(req),
  validate: { keyGeneratorIpFallback: false, xForwardedForHeader: false },
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
});

// ── install ─────────────────────────────────────────────────────────────
function install(app) {
  // nginx is one hop in front; needed for req.ip and the rate limiter.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use('/api/auth', require('../routes/auth.cjs'));
  app.use('/api', authenticate, requireRole);
  console.log('🔐 auth installed: every /api route now requires a session');
}

module.exports = {
  install, authenticate, requireRole, requireSession, loginLimiter,
  createSession, destroySession, destroyOtherSessions, resolveSession,
  hashPassword, verifyPassword, validateNewPassword, publicUser, publicBorrower,
  COOKIE_NAME,
};
