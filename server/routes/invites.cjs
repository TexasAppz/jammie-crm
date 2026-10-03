'use strict';
/**
 * server/routes/invites.cjs — PUBLIC: the two requests an invite link makes.
 *
 * Mounted at /api/invites. Both paths are listed in lib/auth.cjs PUBLIC, so
 * no session is needed; the token in the URL is the credential. Anything
 * else under /api/invites still hits the auth gate.
 *
 *   GET  /api/invites/:token          what the accept page shows before the
 *                                     borrower commits: their first name, the
 *                                     MLO's name, a masked email, and whether
 *                                     an account already exists for the email.
 *   POST /api/invites/:token/accept   { password }  -> creates the borrower
 *                                     account, links it to the loan, marks the
 *                                     invite used, signs the borrower in.
 *
 * Token handling: the URL carries the raw token; only SHA-256(token) is in
 * loan_invites. Lookups are by hash, so a database read never yields a
 * usable link.
 *
 * Statuses returned by GET: ok | expired | revoked | accepted | invalid
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../db.cjs');
const auth    = require('../lib/auth.cjs');

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const TOKEN_RX = /^[A-Za-z0-9_-]{20,}$/;

function maskEmail(e) {
  const [u, d] = String(e || '').split('@');
  if (!u || !d) return '';
  const head = u.length <= 2 ? u[0] : u.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(2, Math.min(6, u.length - head.length)))}@${d}`;
}

async function loadInvite(token) {
  if (!TOKEN_RX.test(token)) return null;
  const [rows] = await db.query(
    `SELECT i.*, (i.expires_at < NOW()) AS expired, l.id AS loan_exists,
            m.first_nm AS mlo_first, m.last_nm AS mlo_last, m.email AS mlo_email,
            m.phone AS mlo_phone, m.nmls_number AS mlo_nmls
       FROM loan_invites i
       LEFT JOIN loans l     ON l.id = i.loan_id
       LEFT JOIN mlo_users m ON m.id = i.mlo_id
      WHERE i.token_hash = ? LIMIT 1`, [sha256(token)]);
  return rows[0] || null;
}

function statusOf(inv) {
  if (!inv || !inv.loan_exists) return 'invalid';
  if (inv.revoked_at)  return 'revoked';
  if (inv.accepted_at) return 'accepted';
  if (inv.expired)     return 'expired';
  return 'ok';
}

// GET /api/invites/:token
router.get('/:token', async (req, res) => {
  try {
    const inv = await loadInvite(req.params.token);
    const status = statusOf(inv);
    if (status === 'invalid') return res.status(404).json({ status });

    const [acct] = await db.query('SELECT id FROM borrower_users WHERE LOWER(email)=? LIMIT 1', [inv.email.toLowerCase()]);
    const mloName = [inv.mlo_first, inv.mlo_last].filter(Boolean).join(' ') || 'Your loan officer';
    res.json({
      status,
      borrowerFirstName: inv.first_nm || '',
      maskedEmail: maskEmail(inv.email),
      existingAccount: acct.length > 0,
      mlo: { name: mloName, email: inv.mlo_email || null, phone: inv.mlo_phone || null, nmls: inv.mlo_nmls || null },
      expiresAt: inv.expires_at,
    });
  } catch (e) {
    console.error('[invites] preview error:', e.message);
    res.status(500).json({ error: 'Could not load invitation' });
  }
});

// POST /api/invites/:token/accept   { password }
router.post('/:token/accept', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const inv = await loadInvite(req.params.token);
    const status = statusOf(inv);
    if (status !== 'ok') return res.status(status === 'invalid' ? 404 : 410).json({ status, error: `This invitation is ${status === 'invalid' ? 'not valid' : status}.` });

    const email = inv.email.toLowerCase();
    const [existing] = await db.query('SELECT * FROM borrower_users WHERE LOWER(email)=? LIMIT 1', [email]);
    let borrower = existing[0] || null;

    // Already have an account for this email? They must sign in with it;
    // the link alone must not grant access to an existing account.
    const current = await auth.resolveSession(req);
    if (borrower) {
      if (!current || current.type !== 'borrower' || current.id !== borrower.id) {
        return res.status(409).json({ status: 'existing_account', error: 'An account already exists for this email. Sign in to continue.' });
      }
      if (!borrower.is_active) return res.status(403).json({ error: 'This account is disabled.' });
    } else {
      const problem = auth.validateNewPassword(req.body?.password);
      if (problem) return res.status(422).json({ error: problem });
    }

    await conn.beginTransaction();
    if (!borrower) {
      const hash = await auth.hashPassword(req.body.password);
      const [ins] = await conn.query('INSERT INTO borrower_users SET ?', {
        email, password_hash: hash, first_nm: inv.first_nm || null, last_nm: inv.last_nm || null,
        preferred_lang: 'en', email_verified_at: new Date(), is_active: 1,
      });
      borrower = { id: ins.insertId, email, first_nm: inv.first_nm, last_nm: inv.last_nm, preferred_lang: 'en', is_active: 1 };
    }

    // Link to the loan: first borrower on a loan is primary, later ones co-borrowers.
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM loan_borrowers WHERE loan_id=?', [inv.loan_id]);
    await conn.query('INSERT IGNORE INTO loan_borrowers SET ?', { loan_id: inv.loan_id, borrower_user_id: borrower.id, role: n === 0 ? 'primary' : 'co_borrower' });

    // Consume the invite (guarded: two clicks on the same link race here).
    const [upd] = await conn.query(
      'UPDATE loan_invites SET accepted_at=NOW(), accepted_by=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL', [borrower.id, inv.id]);
    if (upd.affectedRows !== 1) { await conn.rollback(); return res.status(410).json({ status: 'accepted', error: 'This invitation was already used.' }); }

    await conn.query(`UPDATE loans SET application_status='in_progress' WHERE id=? AND application_status IN ('draft','invited')`, [inv.loan_id]);
    await conn.commit();

    if (!current || current.type !== 'borrower' || current.id !== borrower.id) {
      await auth.createSession(req, res, 'borrower', borrower.id);
    }
    db.query('UPDATE borrower_users SET last_login_at=NOW() WHERE id=?', [borrower.id]).catch(() => {});
    res.json({ ok: true, loanId: inv.loan_id, user: auth.publicBorrower(borrower) });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    console.error('[invites] accept error:', e.message);
    res.status(500).json({ error: 'Could not accept invitation' });
  } finally {
    conn.release();
  }
});

module.exports = router;
