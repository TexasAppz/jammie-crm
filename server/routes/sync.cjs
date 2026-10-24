'use strict';
/**
 * server/routes/sync.cjs — live sync between the loan officer's editor and the borrower's application.
 *
 * Mounted twice: /api/sync (MLO sessions) and /api/apply-sync (borrower sessions — the /api/apply
 * prefix maps to the borrower role in lib/auth.cjs). The handlers check the session type themselves.
 *
 *   GET /:loanId/head                  { head }  — newest revision id (where a screen starts watching)
 *   GET /:loanId?since=N               { head, changes:[{id, source, actor_name, slot, sections:[..], event, at}] }
 *                                      revisions after N made by the OTHER side (an MLO screen is not
 *                                      told about MLO saves, a borrower screen not about borrower saves)
 *   PUT /:loanId/mlo                   MLO diff save in one transaction:
 *                                      { loan:{col:val}, form1003:{col:val}, coborrowers:[{slot,...}] }
 *                                      only the columns that changed on screen are sent; writes a
 *                                      revision row with the sections touched. (MLO only.)
 *   POST /:loanId/revision             { sections:[..], event? }  record a revision from an MLO-side
 *                                      action that wrote through another route (MISMO import, credit).
 *
 * Why a revision log instead of comparing updated_at: it says WHO changed WHAT, so each screen can
 * ignore its own saves, name the other person in the toast and mark the right tab.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const F       = require('../lib/apply-fields.cjs');

const who = req => ({ id: req.user?.id, name: req.user?.name || [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || req.user?.email || null });

/** The loan is visible to this session: any MLO; a borrower only when loan_borrowers links them. */
async function access(req, loanId) {
  if (req.user?.type === 'mlo') return { side: 'mlo' };
  if (req.user?.type === 'borrower') {
    const [[lb]] = await db.query('SELECT role, slot FROM loan_borrowers WHERE loan_id=? AND borrower_user_id=?', [loanId, req.user.id]);
    return lb ? { side: 'borrower', slot: lb.slot } : null;
  }
  return null;
}

async function record(conn, { loanId, source, actor, slot = null, sections = [], event = 'saved' }) {
  const [r] = await (conn || db).query('INSERT INTO loan_revisions SET ?', {
    loan_id: loanId, source, actor_id: actor?.id || null, actor_name: actor?.name || null, slot,
    sections: [...new Set(sections)].join(',').slice(0, 255) || null, event,
  });
  return r.insertId;
}

router.get('/:loanId/head', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    if (!(await access(req, loanId))) return res.status(404).json({ error: 'Loan not found' });
    const [[h]] = await db.query('SELECT COALESCE(MAX(id),0) AS head FROM loan_revisions WHERE loan_id=?', [loanId]);
    res.json({ head: Number(h.head) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const a = await access(req, loanId);
    if (!a) return res.status(404).json({ error: 'Loan not found' });
    const since = Number(req.query.since || 0);
    const [[h]] = await db.query('SELECT COALESCE(MAX(id),0) AS head FROM loan_revisions WHERE loan_id=?', [loanId]);
    const [rows] = await db.query('SELECT id, source, actor_name, slot, sections, event, created_at FROM loan_revisions WHERE loan_id=? AND id>? AND source<>? ORDER BY id LIMIT 200', [loanId, since, a.side]);
    res.json({ head: Number(h.head), changes: rows.map(r => ({ id: r.id, source: r.source, actor_name: r.actor_name, slot: r.slot, sections: r.sections ? r.sections.split(',') : [], event: r.event, at: r.created_at })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Which part of the application a 1003 / loans column belongs to (for the borrower's toast + the MLO's tab dots).
const SECTION_OF = (col) => {
  if (/_json$/.test(col)) return col.replace(/_json$/, '');                          // incomes, assets, liabilities, reos, declarations, demographics, prev_addresses
  if (/^(sp_|prop_|attachment_type|occupancy|year_built|year_acquired|num_units|construction_method|acreage|orig_cost|manner_title|title_held_in|property_rights|trust_info|vesting_read|lien_position|refi_type|cash_out_purpose|rate$|loan_amount|sales_price|appraised_value|down_payment|purpose|subject_property|dot_)/.test(col)) return 'shared';
  if (/^(first_nm|middle_nm|last_nm|suffix|ssn|dob|citizenship|email|cell_phone|home_phone|work_phone|marital_status|num_dependents|dependents_ages|alt_names|address_|mailing_|current_how_long|housing|rent_monthly|is_veteran|is_disabled_vet|is_exempt|va_use|joined_to|tax_same|addr_same)/.test(col)) return 'borrower';
  if (/^(pmt_|estimated_closing|prepaid|lender_credit|cash_to|total_payoffs|closing_)/.test(col)) return 'loan';
  return 'loan';
};

// Columns the MLO editor may write here (everything the two save routines send). Anything else is dropped.
const LOAN_COLS = new Set(['borrower', 'loan_status', 'loan_amount', 'rate', 'ltv', 'sales_price', 'appraised_value', 'down_payment', 'existing_liens_amount', 'refinance_program', 'purpose', 'refi_type',
  'pmt_first_mortgage', 'pmt_hoi', 'pmt_property_taxes', 'pmt_mi', 'pmt_supplemental', 'pmt_association_dues', 'pmt_other', 'pmt_other_desc', 'estimated_closing_costs', 'prepaid_items_estimated',
  'lender_credit_amount', 'cash_to_borrower', 'total_payoffs', 'subject_property', 'product', 'lender', 'lock_status', 'closing_date', 'closing_costs_financed', 'credit_score', 'updated_at']);

router.put('/:loanId/mlo', async (req, res) => {
  if (req.user?.type !== 'mlo') return res.status(403).json({ error: 'Not allowed for this account type' });
  const conn = await db.getConnection();
  try {
    const loanId = Number(req.params.loanId);
    const body = req.body || {};
    const sections = new Set();
    await conn.beginTransaction();
    const [[loan]] = await conn.query('SELECT id, pmt_hoi, pmt_hoi_locked_at FROM loans WHERE id=? FOR UPDATE', [loanId]);
    if (!loan) { await conn.rollback(); return res.status(404).json({ error: 'Loan not found' }); }

    // 1. loans
    const loanSet = {};
    for (const [k, v] of Object.entries(body.loan || {})) if (LOAN_COLS.has(k) && k !== 'updated_at') loanSet[k] = v;
    delete loanSet.pmt_hoi_source; delete loanSet.hoi_quote_id;
    if (loan.pmt_hoi_locked_at) delete loanSet.pmt_hoi;                       // a borrower-accepted quote owns this figure
    else if ('pmt_hoi' in loanSet) {
      const incoming = loanSet.pmt_hoi == null || loanSet.pmt_hoi === '' ? null : Number(loanSet.pmt_hoi);
      const current = loan.pmt_hoi == null ? null : Number(loan.pmt_hoi);
      if (incoming === current) delete loanSet.pmt_hoi;                                               // same figure (e.g. the estimate echoed back): nothing to record
      else if (incoming != null && incoming > 0) { loanSet.pmt_hoi_source = 'manual'; loanSet.pmt_hoi_note = 'Entered by the loan officer'; }
      else { loanSet.pmt_hoi_source = null; loanSet.pmt_hoi_note = null; }                            // cleared: the estimate may fill it again
    }
    if (Object.keys(loanSet).length) { await conn.query('UPDATE loans SET ? WHERE id=?', [loanSet, loanId]); Object.keys(loanSet).forEach(k => sections.add(SECTION_OF(k))); }

    // 2. form_1003_main_borrower (created on first save, like the editor does)
    const f = body.form1003 || {};
    const f1003 = {}; for (const [k, v] of Object.entries(f)) if (/^[a-z0-9_]{1,64}$/i.test(k) && k !== 'id' && k !== 'loan_id') f1003[k] = v;
    if (Object.keys(f1003).length) {
      const [[main]] = await conn.query('SELECT id FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1 FOR UPDATE', [loanId]);
      if (main) await conn.query('UPDATE form_1003_main_borrower SET ? WHERE id=?', [f1003, main.id]);
      else await conn.query('INSERT INTO form_1003_main_borrower SET ?', { ...f1003, loan_id: loanId, mlo_id: req.user?.id || null });
      Object.keys(f1003).forEach(k => sections.add(SECTION_OF(k)));
    }

    // 3. co-borrowers (slots 2..4) — only the ones that changed
    const cobs = Array.isArray(body.coborrowers) ? body.coborrowers : [];
    for (const item of cobs.slice(0, 3)) {
      const slot = Number(item && item.slot);
      if (!(slot >= 2 && slot <= 4)) continue;
      const set = F.coerce(F.BORROWER, item);
      await conn.query('INSERT INTO form_1003_coborrowers SET ? ON DUPLICATE KEY UPDATE ' + ['loan_id', 'slot', ...Object.keys(set)].map(k => `${k}=VALUES(${k})`).join(', '), [{ loan_id: loanId, slot, ...set }]);
      sections.add('coborrowers');
    }
    if (cobs.length) {
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM form_1003_coborrowers WHERE loan_id=?', [loanId]);
      await conn.query('UPDATE form_1003_main_borrower SET num_borrowers=? WHERE loan_id=?', [1 + n, loanId]);
    }

    let rev = null;
    if (sections.size) rev = await record(conn, { loanId, source: 'mlo', actor: who(req), sections: [...sections] });
    await conn.commit();
    const [[fresh]] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
    res.json({ ok: true, revision: rev, sections: [...sections], loan: fresh, nothing: !sections.size });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally { try { conn.release(); } catch (_) {} }
});

router.post('/:loanId/revision', async (req, res) => {
  if (req.user?.type !== 'mlo') return res.status(403).json({ error: 'Not allowed for this account type' });
  try {
    const loanId = Number(req.params.loanId);
    const sections = Array.isArray(req.body?.sections) ? req.body.sections.map(String) : [];
    const event = ['saved', 'imported'].includes(req.body?.event) ? req.body.event : 'saved';
    const id = await record(null, { loanId, source: 'mlo', actor: who(req), sections, event });
    res.status(201).json({ ok: true, revision: id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.record = record;
