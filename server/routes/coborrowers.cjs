'use strict';
/**
 * server/routes/coborrowers.cjs — the CRM's view of co-borrowers.
 *
 * Mounted at /api/coborrowers, behind the auth gate (MLO sessions only).
 * Before Phase 3 the CRM's "+ Add Co-Borrower" lived only in memory; these
 * rows (form_1003_coborrowers, slots 2..4) are where it now persists, and
 * where the portal writes what a co-borrower enters about themselves.
 *
 *   GET    /api/coborrowers/:loanId          rows for the loan, by slot
 *   PUT    /api/coborrowers/:loanId          [{ slot, ...fields }] upsert each
 *                                            (same allow-list as the portal)
 *   DELETE /api/coborrowers/:loanId/:slot    remove a seat the MLO added by
 *                                            mistake. Refused if a borrower
 *                                            account is already linked to it.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const F       = require('../lib/apply-fields.cjs');

const COLS = Object.keys(F.BORROWER);
const parseJson = (raw, fb) => { try { const v = JSON.parse(raw); return v == null ? fb : v; } catch { return fb; } };

function out(row) {
  const o = { id: row.id, loan_id: row.loan_id, slot: row.slot, borrower_user_id: row.borrower_user_id, label: F.labelForSlot(row.slot) };
  for (const c of COLS) {
    let v = row[c];
    if (v instanceof Date) v = v.toISOString().slice(0, 10);
    o[c] = v;
  }
  o.alt_names = parseJson(row.alt_names, []);
  o.prev_addresses_json = parseJson(row.prev_addresses_json, []);
  return o;
}

router.get('/:loanId', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM form_1003_coborrowers WHERE loan_id=? ORDER BY slot', [Number(req.params.loanId)]);
    res.json(rows.map(out));
  } catch (e) { console.error('[coborrowers] get error:', e.message); res.status(500).json({ error: 'Could not load co-borrowers' }); }
});

router.put('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const items = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.coborrowers) ? req.body.coborrowers : null);
    if (!items) return res.status(422).json({ error: 'Expected an array of co-borrowers' });
    const [[loan]] = await db.query('SELECT id FROM loans WHERE id=?', [loanId]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    for (const item of items.slice(0, 3)) {
      const slot = Number(item && item.slot);
      if (!(slot >= 2 && slot <= 4)) continue;
      const set = F.coerce(F.BORROWER, item);
      await db.query(
        'INSERT INTO form_1003_coborrowers SET ? ON DUPLICATE KEY UPDATE ' + ['loan_id', 'slot', ...Object.keys(set)].map(k => `${k}=VALUES(${k})`).join(', '),
        [{ loan_id: loanId, slot, ...set }]);
    }
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM form_1003_coborrowers WHERE loan_id=?', [loanId]);
    await db.query('UPDATE form_1003_main_borrower SET num_borrowers=? WHERE loan_id=?', [1 + n, loanId]);
    const [rows] = await db.query('SELECT * FROM form_1003_coborrowers WHERE loan_id=? ORDER BY slot', [loanId]);
    res.json(rows.map(out));
  } catch (e) { console.error('[coborrowers] put error:', e.message); res.status(500).json({ error: 'Could not save co-borrowers' }); }
});

router.delete('/:loanId/:slot', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId), slot = Number(req.params.slot);
    if (!(slot >= 2 && slot <= 4)) return res.status(422).json({ error: 'Bad slot' });
    const [[linked]] = await db.query('SELECT COUNT(*) AS n FROM loan_borrowers WHERE loan_id=? AND slot=?', [loanId, slot]);
    if (linked.n) return res.status(409).json({ error: 'This co-borrower has a portal account on the loan. Revoke their access first.' });
    await db.query('DELETE FROM form_1003_coborrowers WHERE loan_id=? AND slot=?', [loanId, slot]);
    await db.query('UPDATE loan_invites SET revoked_at=NOW() WHERE loan_id=? AND slot=? AND accepted_at IS NULL AND revoked_at IS NULL', [loanId, slot]);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM form_1003_coborrowers WHERE loan_id=?', [loanId]);
    await db.query('UPDATE form_1003_main_borrower SET num_borrowers=? WHERE loan_id=?', [1 + n, loanId]);
    res.json({ ok: true });
  } catch (e) { console.error('[coborrowers] delete error:', e.message); res.status(500).json({ error: 'Could not remove co-borrower' }); }
});

module.exports = router;
