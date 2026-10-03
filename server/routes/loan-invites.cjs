'use strict';
/**
 * server/routes/loan-invites.cjs — MLO side of invitations.
 *
 * Mounted at /api/loan-invites, behind the auth gate (MLO sessions only).
 *
 *   GET    /api/loan-invites/:loanId          status for the Form 1003 topbar:
 *                                             application_status, the latest
 *                                             invite (email, sent/expires/
 *                                             accepted), linked borrowers.
 *   POST   /api/loan-invites/:loanId          { first_nm, last_nm, email, purpose? }
 *                                             update the loan's borrower name +
 *                                             purpose, revoke any open invite,
 *                                             create a new 7-day token, email it,
 *                                             set application_status='invited'.
 *                                             Returns inviteUrl for "Copy link".
 *   POST   /api/loan-invites/:loanId/resend   new token, same email/name; old
 *                                             link stops working.
 *   DELETE /api/loan-invites/:loanId          revoke the open invite; status
 *                                             goes back to 'draft' if nobody
 *                                             has accepted yet.
 *
 * Email never blocks: if the provider fails the invite is still saved and
 * the response says emailed:false so the MLO can copy the link or resend.
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../db.cjs');
const email   = require('../lib/email.cjs');

const INVITE_DAYS = 7;
const sha256   = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean    = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);

const PURPOSES = ['Purchase Home', 'Refinance', 'Construction'];   // same values the 1003 form uses

async function loadLoan(id) {
  const [rows] = await db.query('SELECT id, mlo_id, borrower, purpose, refi_type, application_status FROM loans WHERE id=? LIMIT 1', [id]);
  return rows[0] || null;
}

/**
 * The borrower's name lives in two places the rest of the app already reads:
 * loans.borrower (the display string in the Loans list) and the loan's
 * form_1003_main_borrower row (first_nm / last_nm / email, what the 1003 and
 * MISMO export use). Keep both in step with what the MLO typed in the dialog.
 */
async function writeBorrowerIdentity(loanId, { first_nm, last_nm, email, purpose }) {
  const set = { borrower: [first_nm, last_nm].filter(Boolean).join(' ') };
  if (purpose) set.purpose = purpose;
  await db.query('UPDATE loans SET ? WHERE id=?', [set, loanId]);

  const [rows] = await db.query('SELECT id FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1', [loanId]);
  if (rows[0]) await db.query('UPDATE form_1003_main_borrower SET first_nm=?, last_nm=?, email=? WHERE id=?', [first_nm, last_nm, email, rows[0].id]);
  else         await db.query('INSERT INTO form_1003_main_borrower SET ?', { loan_id: loanId, first_nm, last_nm, email });
}
async function loadMlo(id) {
  const [rows] = await db.query('SELECT id, first_nm, last_nm, email, phone, nmls_number FROM mlo_users WHERE id=? LIMIT 1', [id]);
  return rows[0] || null;
}
async function latestInvite(loanId) {
  const [rows] = await db.query('SELECT id, email, first_nm, last_nm, expires_at, accepted_at, revoked_at, created_at, (expires_at < NOW()) AS expired FROM loan_invites WHERE loan_id=? ORDER BY id DESC LIMIT 1', [loanId]);
  return rows[0] || null;
}
function inviteState(inv) {
  if (!inv) return null;
  if (inv.revoked_at)  return 'revoked';
  if (inv.accepted_at) return 'accepted';
  if (inv.expired)     return 'expired';
  return 'pending';
}
async function statusPayload(loanId) {
  const loan = await loadLoan(loanId);
  if (!loan) return null;
  const inv = await latestInvite(loanId);
  const [borrowers] = await db.query(
    `SELECT b.id, b.email, b.first_nm, b.last_nm, lb.role, lb.joined_at, b.last_login_at
       FROM loan_borrowers lb JOIN borrower_users b ON b.id = lb.borrower_user_id
      WHERE lb.loan_id=? ORDER BY lb.role, lb.joined_at`, [loanId]);
  return {
    loanId: loan.id,
    applicationStatus: loan.application_status || 'draft',
    purpose: loan.purpose || null,
    invite: inv ? { email: inv.email, state: inviteState(inv), sentAt: inv.created_at, expiresAt: inv.expires_at, acceptedAt: inv.accepted_at } : null,
    borrowers,
  };
}

/** Create + email a fresh invite. Revokes any open one first. */
async function issueInvite({ loan, mlo, first_nm, last_nm, to }) {
  await db.query('UPDATE loan_invites SET revoked_at=NOW() WHERE loan_id=? AND accepted_at IS NULL AND revoked_at IS NULL', [loan.id]);
  const token = newToken();
  // Expiry is computed and compared in the database's clock only, so Node
  // and MariaDB never have to agree on a timezone.
  const [ins] = await db.query(
    `INSERT INTO loan_invites (loan_id, mlo_id, email, first_nm, last_nm, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [loan.id, mlo ? mlo.id : null, to, first_nm, last_nm, sha256(token), INVITE_DAYS]);
  const [[{ expires }]] = await db.query('SELECT expires_at AS expires FROM loan_invites WHERE id=?', [ins.insertId]);
  await db.query(`UPDATE loans SET application_status='invited' WHERE id=? AND application_status='draft'`, [loan.id]);
  const sent = await email.sendInvite({
    to, loanId: loan.id, borrowerFirst: first_nm,
    mlo: mlo || { first_nm: null, last_nm: null, email: null, phone: null },
    token, expiresDays: INVITE_DAYS,
  });
  return { inviteUrl: sent.link, emailed: sent.ok, dryRun: sent.dryRun, emailError: sent.error || null, expiresAt: expires };
}

// GET /api/loan-invites/:loanId
router.get('/:loanId', async (req, res) => {
  try {
    const p = await statusPayload(Number(req.params.loanId));
    if (!p) return res.status(404).json({ error: 'Loan not found' });
    res.json(p);
  } catch (e) {
    console.error('[loan-invites] status error:', e.message);
    res.status(500).json({ error: 'Could not load invite status' });
  }
});

// POST /api/loan-invites/:loanId   { first_nm, last_nm, email, purpose? }
router.post('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const loan = await loadLoan(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.application_status === 'submitted') return res.status(409).json({ error: 'This application has already been submitted.' });

    const first_nm = clean(req.body?.first_nm, 100);
    const last_nm  = clean(req.body?.last_nm, 100);
    const to       = clean(req.body?.email, 255)?.toLowerCase() || null;
    const purpose  = PURPOSES.includes(req.body?.purpose) ? req.body.purpose : null;
    if (!first_nm || !last_nm) return res.status(422).json({ error: 'Borrower first and last name are required' });
    if (!to || !EMAIL_RX.test(to)) return res.status(422).json({ error: 'A valid borrower email is required' });

    await writeBorrowerIdentity(loanId, { first_nm, last_nm, email: to, purpose });

    const mlo = await loadMlo(req.user.id);
    const out = await issueInvite({ loan, mlo, first_nm, last_nm, to });
    res.json({ ok: true, ...out, status: await statusPayload(loanId) });
  } catch (e) {
    console.error('[loan-invites] create error:', e.message);
    res.status(500).json({ error: 'Could not send invitation' });
  }
});

// POST /api/loan-invites/:loanId/resend
router.post('/:loanId/resend', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const loan = await loadLoan(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.application_status === 'submitted') return res.status(409).json({ error: 'This application has already been submitted.' });
    const prev = await latestInvite(loanId);
    if (!prev) return res.status(404).json({ error: 'No invitation to resend — send one first' });
    if (prev.accepted_at) return res.status(409).json({ error: 'The borrower already accepted this invitation.' });

    const mlo = await loadMlo(req.user.id);
    const out = await issueInvite({ loan, mlo, first_nm: prev.first_nm, last_nm: prev.last_nm, to: prev.email });
    res.json({ ok: true, ...out, status: await statusPayload(loanId) });
  } catch (e) {
    console.error('[loan-invites] resend error:', e.message);
    res.status(500).json({ error: 'Could not resend invitation' });
  }
});

// DELETE /api/loan-invites/:loanId
router.delete('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const loan = await loadLoan(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const [r] = await db.query('UPDATE loan_invites SET revoked_at=NOW() WHERE loan_id=? AND accepted_at IS NULL AND revoked_at IS NULL', [loanId]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM loan_borrowers WHERE loan_id=?', [loanId]);
    if (n === 0) await db.query(`UPDATE loans SET application_status='draft' WHERE id=? AND application_status='invited'`, [loanId]);
    res.json({ ok: true, revoked: r.affectedRows, status: await statusPayload(loanId) });
  } catch (e) {
    console.error('[loan-invites] revoke error:', e.message);
    res.status(500).json({ error: 'Could not revoke invitation' });
  }
});

module.exports = router;
