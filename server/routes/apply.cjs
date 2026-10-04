'use strict';
/**
 * server/routes/apply.cjs — the borrower's own API.
 *
 * Mounted at /api/apply. lib/auth.cjs maps this prefix to the 'borrower'
 * role, so every request here carries a borrower session and req.user.id is
 * a borrower_users.id. Authorization is per loan: a borrower sees only the
 * loans that loan_borrowers links to them, and only their own seat on it.
 *
 *   GET /api/apply                    my loans (status, purpose, loan officer)
 *   GET /api/apply/:loanId            one loan, same shape
 *   GET /api/apply/:loanId/form       everything the application screens need:
 *                                     my identity/address fields, my entries in
 *                                     the financial lists, my declarations and
 *                                     demographics, the shared loan fields
 *                                     (editable only for the primary), my
 *                                     progress, and the other borrowers' state.
 *   PUT /api/apply/:loanId/form       { borrower?, lists?, declarations?,
 *                                       demographics?, shared?, progress? }
 *                                     Each part is allow-listed in
 *                                     lib/apply-fields.cjs. Lists are merged
 *                                     by borrower label inside a row lock so
 *                                     two people saving at once never lose
 *                                     each other's entries. 409 once submitted.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const F       = require('../lib/apply-fields.cjs');

// ── my loans ────────────────────────────────────────────────────────────
const LOAN_SQL = `
  SELECT l.id, l.loan_number, l.borrower, l.purpose, l.application_status, l.submitted_at, l.subject_property,
         l.created_at, l.updated_at, lb.role, lb.slot, lb.progress_json, lb.last_seen_step, lb.completed_at,
         m.first_nm AS mlo_first, m.last_nm AS mlo_last, m.email AS mlo_email, m.phone AS mlo_phone, m.nmls_number AS mlo_nmls
    FROM loan_borrowers lb
    JOIN loans l      ON l.id = lb.loan_id
    LEFT JOIN mlo_users m ON m.id = l.mlo_id
   WHERE lb.borrower_user_id = ?`;

const parseJson = (raw, fallback) => { try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; } };

function shape(r) {
  return {
    id: r.id,
    loanNumber: r.loan_number,
    borrowerName: r.borrower,
    purpose: r.purpose || null,
    applicationStatus: r.application_status || 'in_progress',
    submittedAt: r.submitted_at,
    subjectProperty: r.subject_property && r.subject_property !== 'TBD' ? r.subject_property : null,
    role: r.role, slot: r.slot,
    progress: parseJson(r.progress_json, {}),
    lastSeenStep: r.last_seen_step || null,
    completedAt: r.completed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
    mlo: {
      name: [r.mlo_first, r.mlo_last].filter(Boolean).join(' ') || 'Your loan officer',
      email: r.mlo_email || null, phone: r.mlo_phone || null, nmls: r.mlo_nmls || null,
    },
  };
}

/** The loan if it belongs to this borrower, else null. Used by every per-loan route. */
async function mine(borrowerId, loanId) {
  const [rows] = await db.query(`${LOAN_SQL} AND l.id = ? LIMIT 1`, [borrowerId, loanId]);
  return rows[0] || null;
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${LOAN_SQL} ORDER BY l.updated_at DESC`, [req.user.id]);
    res.json({ user: req.user, loans: rows.map(shape) });
  } catch (e) { console.error('[apply] list error:', e.message); res.status(500).json({ error: 'Could not load your application' }); }
});

router.get('/:loanId', async (req, res) => {
  try {
    const r = await mine(req.user.id, Number(req.params.loanId));
    if (!r) return res.status(404).json({ error: 'Application not found' });
    res.json(shape(r));
  } catch (e) { console.error('[apply] get error:', e.message); res.status(500).json({ error: 'Could not load your application' }); }
});

// ── the form ────────────────────────────────────────────────────────────
const BORROWER_COLS = Object.keys(F.BORROWER);
const SHARED_1003_COLS = Object.keys(F.SHARED_1003);
const SHARED_LOAN_COLS = Object.keys(F.SHARED_LOANS);
const LIST_COLS = Object.values(F.LISTS).map(l => l.column);

/** Ensure the loan has a 1003 main row; return it (locked when conn given). */
async function mainRow(conn, loanId, { forUpdate = false } = {}) {
  const q = conn || db;
  const [rows] = await q.query(`SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [loanId]);
  if (rows[0]) return rows[0];
  const [[loan]] = await q.query('SELECT mlo_id FROM loans WHERE id=?', [loanId]);
  await q.query('INSERT INTO form_1003_main_borrower SET ?', { loan_id: loanId, mlo_id: loan ? loan.mlo_id : null });
  const [again] = await q.query(`SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [loanId]);
  return again[0];
}

async function cobRow(conn, loanId, slot, { forUpdate = false, create = false } = {}) {
  const q = conn || db;
  const [rows] = await q.query(`SELECT * FROM form_1003_coborrowers WHERE loan_id=? AND slot=? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [loanId, slot]);
  if (rows[0] || !create) return rows[0] || null;
  await q.query('INSERT IGNORE INTO form_1003_coborrowers SET ?', { loan_id: loanId, slot });
  const [again] = await q.query(`SELECT * FROM form_1003_coborrowers WHERE loan_id=? AND slot=? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [loanId, slot]);
  return again[0];
}

function pickCols(row, cols) {
  const out = {};
  for (const c of cols) {
    let v = row ? row[c] : null;
    if (v instanceof Date) v = v.toISOString().slice(0, 10);
    out[c] = v == null ? '' : v;
  }
  // JSON columns come back parsed for the client
  if ('alt_names' in out) out.alt_names = parseJson(row && row.alt_names, []);
  if ('prev_addresses_json' in out) out.prev_addresses_json = parseJson(row && row.prev_addresses_json, []);
  return out;
}

async function othersOnLoan(loanId, mySlot) {
  const [rows] = await db.query(
    `SELECT lb.slot, lb.role, lb.completed_at, lb.progress_json, b.first_nm, b.last_nm, b.email
       FROM loan_borrowers lb JOIN borrower_users b ON b.id = lb.borrower_user_id
      WHERE lb.loan_id=? AND lb.slot<>? ORDER BY lb.slot`, [loanId, mySlot]);
  return rows.map(r => ({
    slot: r.slot, role: r.role, name: [r.first_nm, r.last_nm].filter(Boolean).join(' ') || r.email,
    completedAt: r.completed_at, progress: parseJson(r.progress_json, {}),
  }));
}

// GET /api/apply/:loanId/form
router.get('/:loanId/form', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const seat = await mine(req.user.id, loanId);
    if (!seat) return res.status(404).json({ error: 'Application not found' });
    const slot = seat.slot || 1;
    const label = F.labelForSlot(slot);

    const main = await mainRow(null, loanId);
    const me   = slot === 1 ? main : await cobRow(null, loanId, slot, { create: true });
    const [[loan]] = await db.query(`SELECT ${SHARED_LOAN_COLS.join(',')}, loan_number, application_status, submitted_at, subject_property FROM loans WHERE id=?`, [loanId]);

    const lists = {};
    for (const [name, def] of Object.entries(F.LISTS)) lists[name] = F.pickList(main[def.column], label, def.ownerKey);

    res.json({
      loan: { id: loanId, loanNumber: loan.loan_number, applicationStatus: loan.application_status, submittedAt: loan.submitted_at, purpose: loan.purpose },
      me: { role: seat.role, slot, label, name: req.user.name, email: req.user.email },
      locked: loan.application_status === 'submitted',
      sharedEditable: slot === 1,
      borrower: pickCols(me, BORROWER_COLS),
      lists,
      declarations: F.getIndexed(main.declarations_json, slot),
      demographics: F.getIndexed(main.demographics_json, slot),
      shared: { ...pickCols(loan, SHARED_LOAN_COLS), ...pickCols(main, SHARED_1003_COLS) },
      progress: parseJson(seat.progress_json, {}),
      lastSeenStep: seat.last_seen_step || null,
      completedAt: seat.completed_at,
      others: await othersOnLoan(loanId, slot),
      mlo: shape(seat).mlo,
    });
  } catch (e) { console.error('[apply] form get error:', e.message); res.status(500).json({ error: 'Could not load your application' }); }
});

// PUT /api/apply/:loanId/form
router.put('/:loanId/form', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const loanId = Number(req.params.loanId);
    const seat = await mine(req.user.id, loanId);
    if (!seat) return res.status(404).json({ error: 'Application not found' });
    if (seat.application_status === 'submitted') return res.status(409).json({ error: 'This application has been submitted and can no longer be edited. Contact your loan officer for changes.' });
    const slot = seat.slot || 1;
    const label = F.labelForSlot(slot);
    const body = req.body || {};
    const saved = [];

    await conn.beginTransaction();

    // 1. my identity / addresses
    if (body.borrower && typeof body.borrower === 'object') {
      const set = F.coerce(F.BORROWER, body.borrower, { skip: slot === 1 ? null : F.BORROWER_PRIMARY_ONLY });
      if (Object.keys(set).length) {
        if (slot === 1) {
          const main = await mainRow(conn, loanId, { forUpdate: true });
          await conn.query('UPDATE form_1003_main_borrower SET ? WHERE id=?', [set, main.id]);
          // keep the Loans list's display name in step
          if (set.first_nm !== undefined || set.last_nm !== undefined) {
            const [[row]] = await conn.query('SELECT first_nm, last_nm FROM form_1003_main_borrower WHERE id=?', [main.id]);
            const name = [row.first_nm, row.last_nm].filter(Boolean).join(' ');
            if (name) await conn.query('UPDATE loans SET borrower=? WHERE id=?', [name, loanId]);
          }
        } else {
          const row = await cobRow(conn, loanId, slot, { forUpdate: true, create: true });
          await conn.query('UPDATE form_1003_coborrowers SET ? WHERE id=?', [set, row.id]);
        }
        // mirror name/email onto the borrower account so headers stay current
        const acct = {};
        if (set.first_nm) acct.first_nm = set.first_nm;
        if (set.last_nm)  acct.last_nm  = set.last_nm;
        if (Object.keys(acct).length) await conn.query('UPDATE borrower_users SET ? WHERE id=?', [acct, req.user.id]);
        saved.push('borrower');
      }
    }

    // 2. lists, declarations, demographics — all on the main row, under one lock
    const wantsLists = body.lists && typeof body.lists === 'object';
    const wantsDecl  = body.declarations && typeof body.declarations === 'object';
    const wantsDemo  = body.demographics && typeof body.demographics === 'object';
    const wantsShared1003 = slot === 1 && body.shared && typeof body.shared === 'object';
    if (wantsLists || wantsDecl || wantsDemo || wantsShared1003) {
      const main = await mainRow(conn, loanId, { forUpdate: true });
      const set = {};
      if (wantsLists) {
        for (const [name, def] of Object.entries(F.LISTS)) {
          if (!Array.isArray(body.lists[name])) continue;
          let entries = body.lists[name];
          // CRM conventions the portal does not ask about
          if (name === 'liabilities') entries = entries.map(e => (e && typeof e === 'object' ? { dti: 'Include', ...e } : e));
          if (name === 'reos')        entries = entries.map(e => (e && typeof e === 'object' ? { isSubject: false, ...e } : e));
          set[def.column] = JSON.stringify(F.mergeList(main[def.column], entries, label, def.ownerKey));
          saved.push(name);
        }
        // The CRM's legacy single-employer columns mirror the primary's first current job.
        if (slot === 1 && Array.isArray(body.lists.incomes)) {
          const job = body.lists.incomes.find(i => i && i.type === 'Employment Income' && i.currentEmp !== false) || body.lists.incomes[0] || {};
          const n = v => { const x = Number(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(x) ? x : 0; };
          Object.assign(set, {
            employee_or_business_nm: String(job.employer || '').slice(0, 255) || null,
            position_title: String(job.position || '').slice(0, 150) || null,
            position_start_date: F.BORROWER.dob(job.startDate),
            self_employed: job.selfEmp ? 1 : 0,
            gross_income_monthly_base: n(job.base), gross_income_monthly_overtime: n(job.overtime),
            gross_income_monthly_bonus: n(job.bonuses), gross_income_monthly_commission: n(job.commission),
            gross_income_monthly_other: n(job.otherW2) + n(job.tips) + n(job.seasonal),
          });
          set.gross_income_monthly_total = ['base','overtime','bonus','commission','other'].reduce((a, k) => a + (set[`gross_income_monthly_${k}`] || 0), 0);
        }
      }
      if (wantsDecl) { set.declarations_json = F.setIndexed(main.declarations_json, slot, body.declarations); saved.push('declarations'); }
      if (wantsDemo) { set.demographics_json = F.setIndexed(main.demographics_json, slot, body.demographics); saved.push('demographics'); }
      if (wantsShared1003) {
        Object.assign(set, F.coerce(F.SHARED_1003, body.shared));
        set.num_borrowers = 1 + (await conn.query('SELECT COUNT(*) AS n FROM form_1003_coborrowers WHERE loan_id=?', [loanId]))[0][0].n;
      }
      if (Object.keys(set).length) await conn.query('UPDATE form_1003_main_borrower SET ? WHERE id=?', [set, main.id]);
    }

    // 3. shared loan-level fields (primary only)
    if (slot === 1 && body.shared && typeof body.shared === 'object') {
      const set = F.coerce(F.SHARED_LOANS, body.shared);
      // subject_property display string, as the CRM builds it
      const s = body.shared;
      if (s.sp_addr1 !== undefined || s.sp_city !== undefined || s.sp_state !== undefined) {
        const [[m]] = await conn.query('SELECT sp_addr1, sp_city, sp_state FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1', [loanId]);
        set.subject_property = m && m.sp_addr1 ? `${m.sp_addr1}${m.sp_city ? ', ' + m.sp_city : ''}${m.sp_state ? ' ' + m.sp_state : ''}` : 'TBD';
      }
      if (set.purpose === 'Purchase Home') { set.refi_type = null; set.cash_out_purpose = null; }
      if (Object.keys(set).length) { await conn.query('UPDATE loans SET ? WHERE id=?', [set, loanId]); saved.push('shared'); }
    } else if (body.shared && slot !== 1) {
      await conn.rollback();
      return res.status(403).json({ error: 'Only the primary borrower can change the loan and property details.' });
    }

    // 4. progress — { steps: { <stepId>: 'done' | 'started' }, flags: { <name>: short string | boolean } }
    //    flags hold answers that are not 1003 data (e.g. "I have no debts", "no property chosen yet").
    if (body.progress && typeof body.progress === 'object') {
      const steps = {}, flags = {};
      for (const [k, v] of Object.entries(body.progress.steps || {})) {
        if (/^[a-z_]{1,30}$/.test(k) && (v === 'done' || v === 'started')) steps[k] = v;
      }
      for (const [k, v] of Object.entries(body.progress.flags || {})) {
        if (/^[A-Za-z_]{1,30}$/.test(k) && (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 20))) flags[k] = v;
      }
      const set = { progress_json: JSON.stringify({ steps, flags }) };
      if (typeof body.lastSeenStep === 'string') set.last_seen_step = body.lastSeenStep.slice(0, 40);
      if (body.completed === true) set.completed_at = new Date();
      if (body.completed === false) set.completed_at = null;
      await conn.query('UPDATE loan_borrowers SET ? WHERE loan_id=? AND borrower_user_id=?', [set, loanId, req.user.id]);
      saved.push('progress');
    }

    await conn.query(`UPDATE loans SET application_status='in_progress', updated_at=NOW() WHERE id=? AND application_status IN ('draft','invited')`, [loanId]);
    await conn.commit();
    res.json({ ok: true, saved, savedAt: new Date().toISOString() });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    console.error('[apply] form put error:', e.message);
    res.status(500).json({ error: 'Could not save. Your changes are kept on this screen — try again in a moment.' });
  } finally {
    try { conn.release(); } catch (_) {}
  }
});

module.exports = router;
module.exports.mine = mine;
