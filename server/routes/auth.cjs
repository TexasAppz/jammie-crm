'use strict';
/**
 * server/routes/auth.cjs — sign in, sign out, who-am-I, change password.
 *
 * Mounted at /api/auth BEFORE the auth gate (see lib/auth.cjs install()),
 * so login and logout are reachable without a session. The routes that
 * need one (me, change-password) apply requireSession themselves.
 *
 * Login accepts email OR username, case-insensitive. Failures return the
 * same message whether the account exists or not, so the form cannot be
 * used to enumerate accounts.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const auth    = require('../lib/auth.cjs');

const GENERIC_FAIL = 'Invalid email/username or password';

// POST /api/auth/login  { login, password }
router.post('/login', auth.loginLimiter, async (req, res) => {
  try {
    const login    = String(req.body?.login || req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!login || !password) return res.status(400).json({ error: 'Email/username and password are required' });

    const [rows] = await db.query(
      'SELECT * FROM mlo_users WHERE LOWER(email)=? OR LOWER(username)=? LIMIT 1', [login, login]);
    const u = rows[0];

    // Always run a compare so timing is the same for unknown accounts.
    const ok = await auth.verifyPassword(password, u ? u.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!u || !ok || !u.is_active) return res.status(401).json({ error: GENERIC_FAIL });

    await auth.createSession(req, res, 'mlo', u.id);
    db.query('UPDATE mlo_users SET last_login_at=NOW() WHERE id=?', [u.id]).catch(() => {});
    res.json(auth.publicUser(u));
  } catch (e) {
    console.error('[auth] login error:', e.message);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ ok: true });
});

// GET /api/auth/me  -> the signed-in user, or 401
router.get('/me', auth.requireSession, (req, res) => {
  res.json(req.user);
});

// POST /api/auth/change-password  { currentPassword, newPassword }
router.post('/change-password', auth.requireSession, async (req, res) => {
  try {
    if (req.user.type !== 'mlo') return res.status(403).json({ error: 'Not allowed' });
    const { currentPassword, newPassword } = req.body || {};
    const problem = auth.validateNewPassword(newPassword);
    if (problem) return res.status(422).json({ error: problem });

    const [rows] = await db.query('SELECT password_hash FROM mlo_users WHERE id=?', [req.user.id]);
    if (!rows[0] || !(await auth.verifyPassword(currentPassword || '', rows[0].password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (await auth.verifyPassword(newPassword, rows[0].password_hash)) {
      return res.status(422).json({ error: 'New password must differ from the current one' });
    }

    const hash = await auth.hashPassword(newPassword);
    await db.query('UPDATE mlo_users SET password_hash=? WHERE id=?', [hash, req.user.id]);
    // Sign out every other device; keep this one.
    await auth.destroyOtherSessions('mlo', req.user.id, req.cookies[auth.COOKIE_NAME]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] change-password error:', e.message);
    res.status(500).json({ error: 'Could not change password' });
  }
});

module.exports = router;
