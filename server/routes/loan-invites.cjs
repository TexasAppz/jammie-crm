'use strict';
/**
 * server/routes/loan-invites.cjs — MLO side of invitations.
 *
 * Mounted at /api/loan-invites, behind the auth gate (MLO sessions only).
 * One loan has up to four seats: slot 1 = primary borrower, slots 2..4 =
 * co-borrowers. Each seat gets its own invite, its own account, its own
 * progress. The primary's identity lives on form_1003_main_borrower; each
 * co-borrower's on form_1003_coborrowers (same column names).
 *
 *   GET    /api/loan-invites/:loanId                  status for the 1003 header:
 *                                                     application_status plus one
 *                                                     row per seat (invite state,
 *                                                     account, progress).
 *   POST   /api/loan-invites/:loanId                  { first_nm, last_nm, email,
 *                                                       purpose?, role? }
 *                                                     role 'primary' (default) or
 *                                                     'co_borrower'. Writes the
 *                                                     name/email where the CRM
 *                                                     reads it, revokes that seat's
 *                                                     open invite, issues a 7-day
 *                                                     token, emails it. Returns
 *                                                     inviteUrl for "Copy link".
 *   POST   /api/loan-invites/:loanId/resend           { role? } new token, same seat
 *   DELETE /api/loan-invites/:loanId?role=co_borrower revoke that seat's open invite
 *
 * Email never blocks: if the provider fails the invite is still saved and
 * the response says emailed:false so the MLO can copy the link or resend.
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../db.cjs');
const email   = require('../lib/email.cjs');
const F       = require('../lib/apply-fields.cjs');

const INVITE_DAYS = 7;
const MAX_SLOT = 4;
const sha256   = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean    = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const PURPOSES = ['Purchase Home', 'Refinance', 'Construction'];   // same values the 1003 form uses
const roleOf   = v => (v === 'co_borrower' ? 'co_borrower' : 'primary');

async function loadLoan(id) {
  const [rows] = await db.query('SELECT id, mlo_id, borrower, purpose, refi_type, application_status FROM loans WHERE id=? LIMIT 1', [id]);
  return rows[0] || null;
}
async function loadMlo(id) {
  const [rows] = await db.query('SELECT id, first_nm, last_nm, email, phone, nmls_number FROM mlo_users WHERE id=? LIMIT 1', [id]);
  return rows[0] || null;
}

/** Latest invite for a seat (primary → role primary; co-borrower → the named slot or the newest co-borrower invite). */
async function latestInvite(loanId, role, slot = null) {
  const [rows] = await db.query(
    `SELECT id, role, slot, email, first_nm, last_nm, expires_at, accepted_at, revoked_at, created_at, (expires_at < NOW()) AS expired
       FROM loan_invites WHERE loan_id=? AND role=? ${slot ? 'AND slot=?' : ''} ORDER BY id DESC LIMIT 1`,
    slot ? [loanId, role, slot] : [loanId, role]);
  return rows[0] || null;
}
function inviteState(inv) {
  if (!inv) return null;
  if (inv.revoked_at)  return 'revoked';
  if (inv.accepted_at) return 'accepted';
  if (inv.expired)     return 'expired';
  return 'pending';
}

/**
 * One row per seat the loan knows about: slot 1 always, plus every
 * co-borrower row and every co-borrower invite.
 */
async function seats(loanId) {
  const [[main]] = await db.query('SELECT first_nm, last_nm, email FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1', [loanId]);
  const [cobs]   = await db.query('SELECT slot, first_nm, last_nm, email FROM form_1003_coborrowers WHERE loan_id=? ORDER BY slot', [loanId]);
  const [links]  = await db.query(
    `SELECT lb.slot, lb.role, lb.completed_at, lb.progress_json, lb.last_seen_step, b.id AS user_id, b.email, b.first_nm, b.last_nm, b.last_login_at
       FROM loan_borrowers lb JOIN borrower_users b ON b.id = lb.borrower_user_id WHERE lb.loan_id=?`, [loanId]);
  const [invs] = await db.query(
    `SELECT id, role, slot, email, first_nm, last_nm, expires_at, accepted_at, revoked_at, created_at, (expires_at < NOW()) AS expired
       FROM loan_invites WHERE loan_id=? ORDER BY id DESC`, [loanId]);

  const out = new Map();
  const seat = (slot) => { if (!out.has(slot)) out.set(slot, { slot, role: slot === 1 ? 'primary' : 'co_borrower', label: F.labelForSlot(slot), name: '', email: null, invite: null, account: null }); return out.get(slot); };
  const s1 = seat(1); s1.name = [main?.first_nm, main?.last_nm].filter(Boolean).join(' '); s1.email = main?.email || null;
  for (const c of cobs) { const s = seat(c.slot); s.name = [c.first_nm, c.last_nm].filter(Boolean).join(' '); s.email = c.email || null; }
  for (const l of links) {
    const s = seat(l.slot);
    s.account = { userId: l.user_id, email: l.email, name: [l.first_nm, l.last_nm].filter(Boolean).join(' '), lastLoginAt: l.last_login_at,
      completedAt: l.completed_at, lastSeenStep: l.last_seen_step, progress: (() => { try { return JSON.parse(l.progress_json || '{}'); } catch { return {}; } })() };
  }
  for (const i of invs) {           // newest first → first one per slot wins
    const slot = i.slot || 1;
    const s = seat(slot);
    if (!s.invite) s.invite = { email: i.email, state: inviteState(i), sentAt: i.created_at, expiresAt: i.expires_at, acceptedAt: i.accepted_at };
    if (!s.email) s.email = i.email;
    if (!s.name)  s.name  = [i.first_nm, i.last_nm].filter(Boolean).join(' ');
  }
  return [...out.values()].sort((a, b) => a.slot - b.slot);
}

async function statusPayload(loanId) {
  const loan = await loadLoan(loanId);
  if (!loan) return null;
  const list = await seats(loanId);
  const nextSlot = (() => { const used = new Set(list.map(s => s.slot)); for (let s = 2; s <= MAX_SLOT; s++) if (!used.has(s)) return s; return null; })();
  return {
    loanId: loan.id,
    applicationStatus: loan.application_status || 'draft',
    purpose: loan.purpose || null,
    seats: list,
    canAddCoBorrower: nextSlot != null && loan.application_status !== 'submitted',
    // back-compat for the Phase 2 header: the primary's invite
    invite: list[0] ? list[0].invite : null,
    borrowers: list.filter(s => s.account).map(s => ({ ...s.account, slot: s.slot, role: s.role })),
  };
}

/** Write the name/email where the CRM reads it, for the given seat. */
async function writeIdentity(loanId, slot, { first_nm, last_nm, email: to, purpose }) {
  if (slot === 1) {
    const set = { borrower: [first_nm, last_nm].filter(Boolean).join(' ') };
    if (purpose) set.purpose = purpose;
    await db.query('UPDATE loans SET ? WHERE id=?', [set, loanId]);
    const [rows] = await db.query('SELECT id FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1', [loanId]);
    if (rows[0]) await db.query('UPDATE form_1003_main_borrower SET first_nm=?, last_nm=?, email=? WHERE id=?', [first_nm, last_nm, to, rows[0].id]);
    else         await db.query('INSERT INTO form_1003_main_borrower SET ?', { loan_id: loanId, first_nm, last_nm, email: to });
  } else {
    await db.query(
      `INSERT INTO form_1003_coborrowers (loan_id, slot, first_nm, last_nm, email) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE first_nm=VALUES(first_nm), last_nm=VALUES(last_nm), email=VALUES(email)`,
      [loanId, slot, first_nm, last_nm, to]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM form_1003_coborrowers WHERE loan_id=?', [loanId]);
    await db.query('UPDATE form_1003_main_borrower SET num_borrowers=? WHERE loan_id=?', [1 + n, loanId]);
  }
}

/** Create + email a fresh invite for a seat. Revokes that seat's open one first. */
async function issueInvite({ loan, mlo, role, slot, first_nm, last_nm, to }) {
  await db.query('UPDATE loan_invites SET revoked_at=NOW() WHERE loan_id=? AND role=? AND slot=? AND accepted_at IS NULL AND revoked_at IS NULL', [loan.id, role, slot]);
  const token = newToken();
  // Expiry is computed and compared in the database's clock only, so Node
  // and MariaDB never have to agree on a timezone.
  const [ins] = await db.query(
    `INSERT INTO loan_invites (loan_id, mlo_id, role, slot, email, first_nm, last_nm, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [loan.id, mlo ? mlo.id : null, role, slot, to, first_nm, last_nm, sha256(token), INVITE_DAYS]);
  const [[{ expires }]] = await db.query('SELECT expires_at AS expires FROM loan_invites WHERE id=?', [ins.insertId]);
  await db.query(`UPDATE loans SET application_status='invited' WHERE id=? AND application_status='draft'`, [loan.id]);
  const sent = await email.sendInvite({
    to, loanId: loan.id, borrowerFirst: first_nm,
    mlo: mlo || { first_nm: null, last_nm: null, email: null, phone: null },
    token, expiresDays: INVITE_DAYS,
  });
  return { inviteUrl: sent.link, emailed: sent.ok, dryRun: sent.dryRun, emailError: sent.error || null, expiresAt: expires, role, slot };
}

// GET /api/loan-invites/:loanId
router.get('/:loanId', async (req, res) => {
  try {
    const p = await statusPayload(Number(req.params.loanId));
    if (!p) return res.status(404).json({ error: 'Loan not found' });
    res.json(p);
  } catch (e) { console.error('[loan-invites] status error:', e.message); res.status(500).json({ error: 'Could not load invite status' }); }
});

// POST /api/loan-invites/:loanId   { first_nm, last_nm, email, purpose?, role?, slot? }
router.post('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const loan = await loadLoan(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.application_status === 'submitted') return res.status(409).json({ error: 'This application has already been submitted.' });

    const role     = roleOf(req.body?.role);
    const first_nm = clean(req.body?.first_nm, 100);
    const last_nm  = clean(req.body?.last_nm, 100);
    const to       = clean(req.body?.email, 255)?.toLowerCase() || null;
    const purpose  = PURPOSES.includes(req.body?.purpose) ? req.body.purpose : null;
    if (!first_nm || !last_nm) return res.status(422).json({ error: 'Borrower first and last name are required' });
    if (!to || !EMAIL_RX.test(to)) return res.status(422).json({ error: 'A valid borrower email is required' });

    // Which seat?
    let slot = 1;
    if (role === 'co_borrower') {
      const requested = Number(req.body?.slot);
      const [[main]] = await db.query('SELECT email FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1', [loanId]);
      if (main && main.email && main.email.toLowerCase() === to) return res.status(422).json({ error: 'That is the primary borrower\'s email. A co-borrower needs their own.' });
      if (requested >= 2 && requested <= MAX_SLOT) slot = requested;
      else {
        const [rows] = await db.query('SELECT slot FROM form_1003_coborrowers WHERE loan_id=? UNION SELECT slot FROM loan_borrowers WHERE loan_id=? AND slot>1', [loanId, loanId]);
        const used = new Set(rows.map(r => r.slot));
        slot = 0; for (let s = 2; s <= MAX_SLOT; s++) if (!used.has(s)) { slot = s; break; }
        if (!slot) return res.status(422).json({ error: `A loan can have at most ${MAX_SLOT - 1} co-borrowers.` });
      }
      const [[taken]] = await db.query('SELECT COUNT(*) AS n FROM loan_borrowers WHERE loan_id=? AND slot=?', [loanId, slot]);
      if (taken.n) return res.status(409).json({ error: 'That co-borrower already has an account on this loan.' });
    } else {
      const [[taken]] = await db.query('SELECT COUNT(*) AS n FROM loan_borrowers WHERE loan_id=? AND slot=1', [loanId]);
      if (taken.n) return res.status(409).json({ error: 'The primary borrower already has an account on this loan.' });
    }

    await writeIdentity(loanId, slot, { first_nm, last_nm, email: to, purpose });
    const mlo = await loadMlo(req.user.id);
    const out = await issueInvite({ loan, mlo, role, slot, first_nm, last_nm, to });
    res.json({ ok: true, ...out, status: await statusPayload(loanId) });
  } catch (e) { console.error('[loan-invites] create error:', e.message); res.status(500).json({ error: 'Could not send invitation' }); }
});

// POST /api/loan-invites/:loanId/resend   { role?, slot? }
router.post('/:loanId/resend', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const loan = await loadLoan(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.application_status === 'submitted') return res.status(409).json({ error: 'This application has already been submitted.' });
    const role = roleOf(req.body?.role);
    const slot = role === 'primary' ? 1 : (Number(req.body?.slot) || null);
    const prev = await latestInvite(loanId, role, slot);
    if (!prev) return res.status(404).json({ error: 'No invitation to resend — send one first' });
    if (prev.accepted_at) return res.status(409).json({ error: 'That borrower already accepted the invitation.' });

    const mlo = await loadMlo(req.user.id);
    const out = await issueInvite({ loan, mlo, role, slot: prev.slot || 1, first_nm: prev.first_nm, last_nm: prev.last_nm, to: prev.email });
    res.json({ ok: true, ...out, status: await statusPayload(loanId) });
  } catch (e) { console.error('[loan-invites] resend error:', e.message); res.status(500).json({ error: 'Could not resend invitation' }); }
});

// DELETE /api/loan-invites/:loanId?role=co_borrower&slot=2
router.delete('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const loan = await loadLoan(loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const role = roleOf(req.query.role);
    const slot = role === 'primary' ? 1 : (Number(req.query.slot) || null);
    const [r] = await db.query(
      `UPDATE loan_invites SET revoked_at=NOW() WHERE loan_id=? AND role=? ${slot ? 'AND slot=?' : ''} AND accepted_at IS NULL AND revoked_at IS NULL`,
      slot ? [loanId, role, slot] : [loanId, role]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM loan_borrowers WHERE loan_id=?', [loanId]);
    const [[{ open }]] = await db.query('SELECT COUNT(*) AS open FROM loan_invites WHERE loan_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()', [loanId]);
    if (n === 0 && open === 0) await db.query(`UPDATE loans SET application_status='draft' WHERE id=? AND application_status='invited'`, [loanId]);
    res.json({ ok: true, revoked: r.affectedRows, status: await statusPayload(loanId) });
  } catch (e) { console.error('[loan-invites] revoke error:', e.message); res.status(500).json({ error: 'Could not revoke invitation' }); }
});

module.exports = router;
