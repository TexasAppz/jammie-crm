'use strict';
/**
 * server/routes/credit.cjs
 *
 * Orders and retrieves credit reports through Equifax Mortgage Solutions,
 * and feeds the Credit Report panel in the CRM (Financial Info tab).
 *
 * ROUTES
 *   GET  /api/credit/config               -> which EMS credential sets are configured (no secrets)
 *   GET  /api/credit/seats/:loanId        -> the loan's borrower seats with their authorization state
 *   POST /api/credit/authorize/:loanId    -> { slot, method, authorizedAt? } record the borrower's authorization
 *   POST /api/credit/preview/:loanId      -> build the request XML WITHOUT sending it  { slots:[1,2], mode, bureaus }
 *   POST /api/credit/order/:loanId        -> order a report  { slots:[1] | [1,2], mode:'hard'|'soft', bureaus:{...} }
 *   GET  /api/credit/loan/:loanId         -> stored reports for a loan (summaries + scores)
 *   GET  /api/credit/:id                  -> one stored report, parsed
 *   GET  /api/credit/:id/pdf              -> the human-readable PDF
 *   GET  /api/credit/:id/raw              -> request + response XML, password and SSNs redacted
 *   POST /api/credit/:id/attach-pdf       -> file the PDF under the loan's Documents tab
 *   POST /api/credit/:id/use-score        -> { borrowerId } copy that borrower's qualifying score to the loan
 *   POST /api/credit/:id/retrieve         -> re-fetch from EMS by order number (free reprint)
 *   POST /api/credit/:id/reparse          -> re-run the parser over the stored raw XML (no EMS call)
 *
 * SEATS. Slot 1 is the primary (form_1003_main_borrower); slots 2..4 are
 * form_1003_coborrowers rows. A report covers one seat (Individual) or two
 * (Joint). BorrowerID B1/B2 in the EMS request follow the order of `slots`.
 *
 * SAFEGUARDS — these are not optional for consumer report data
 *   1. AUTHORIZATION GATE. Every seat on the order must have
 *      credit_pull_authorized_at set (recorded here via /authorize, or by the
 *      borrower's own consent in the portal). Ordering credit without a
 *      permissible purpose is an FCRA violation with statutory damages.
 *   2. AUDIT. Every attempt is written to credit_pull_audit, including
 *      refusals and failures — never just successes.
 *   3. SSN HANDLING. The full SSN goes to EMS in the request and nowhere
 *      else. Audit rows store the last 4 only. The stored raw response
 *      contains the SSN as EMS echoes it; /raw returns it redacted.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const ems     = require('../lib/ems.cjs');

const last4 = ssn => String(ssn || '').replace(/\D/g, '').slice(-4) || null;
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || '').trim() || req.ip || null;
const who = req => req.user?.email || req.user?.username || req.user?.name || null;
const parseSlots = v => {
  const a = (Array.isArray(v) ? v : String(v ?? '1').split(',')).map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 4);
  return [...new Set(a.length ? a : [1])].sort((x, y) => x - y).slice(0, 2);
};
const seatLabel = slot => slot === 1 ? 'Borrower' : slot === 2 ? 'Co-Borrower' : `Borrower ${slot}`;

async function audit(entry) {
  try {
    await db.query('INSERT INTO credit_pull_audit SET ?', {
      loan_id: entry.loanId ?? null,
      credit_report_id: entry.creditReportId ?? null,
      action: entry.action || 'Submit',
      pull_mode: entry.mode || 'hard',
      outcome: entry.outcome,
      detail: (entry.detail || '').slice(0, 500),
      requested_by: entry.requestedBy ?? null,
      requested_from_ip: entry.ip ?? null,
      borrower_ssn_last4: entry.ssnLast4 ?? null,
    });
  } catch (e) {
    // The audit table must never take the order path down, but a failed
    // audit write is itself worth knowing about.
    console.error('[credit] audit write failed:', e.message);
  }
}

const STATE_CODES = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',
  delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',
  kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',
  minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI',
  'south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',
  virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC',
};
function stateCode(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return STATE_CODES[s.toLowerCase()] || s;
}

// Map a 1003 row (primary or co-borrower — same column names) -> the shape ems.cjs expects.
function toEmsBorrower(f) {
  return {
    firstName: f.first_nm, middleName: f.middle_nm, lastName: f.last_nm, suffix: f.suffix,
    ssn: f.ssn, dob: f.dob,
    residence: {
      street: [f.address_num, f.address_street, f.address_unit].filter(Boolean).join(' '),
      city: f.address_city,
      // Jammie stores state names ("Georgia"); EMS wants "GA".
      state: stateCode(f.address_state),
      zip: f.address_zip,
      years: f.current_how_long_addr,
    },
  };
}

async function loadLoan(loanId) {
  const [[loan]] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
  return loan || null;
}

/** All seats on a loan: slot 1 from the main row, 2..4 from form_1003_coborrowers. */
async function loadSeats(loanId) {
  const [[main]] = await db.query('SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY updated_at DESC, id DESC LIMIT 1', [loanId]);
  const [cobs] = await db.query('SELECT * FROM form_1003_coborrowers WHERE loan_id=? ORDER BY slot', [loanId]);
  const seats = [];
  if (main) seats.push({ slot: 1, row: main });
  for (const c of cobs) seats.push({ slot: c.slot, row: c });
  return seats;
}

function seatSummary(seat) {
  const r = seat.row;
  const b = toEmsBorrower(r);
  const problems = ems.validateBorrower(b, seatLabel(seat.slot));
  return {
    slot: seat.slot, label: seatLabel(seat.slot),
    name: [r.first_nm, r.last_nm].filter(Boolean).join(' ') || seatLabel(seat.slot),
    ssnLast4: last4(r.ssn), hasSsn: String(r.ssn || '').replace(/\D/g, '').length === 9,
    address: [b.residence.street, b.residence.city, b.residence.state, b.residence.zip].filter(Boolean).join(', '),
    ready: problems.length === 0, problems,
    authorizedAt: r.credit_pull_authorized_at || null, authMethod: r.credit_pull_auth_method || null,
  };
}

async function setAuthorization(loanId, slot, method, at) {
  const table = slot === 1 ? 'form_1003_main_borrower' : 'form_1003_coborrowers';
  const where = slot === 1 ? 'loan_id=?' : 'loan_id=? AND slot=?';
  const args = slot === 1 ? [loanId] : [loanId, slot];
  const [r] = await db.query(`UPDATE ${table} SET credit_pull_auth_method=?, credit_pull_authorized_at=? WHERE ${where}`, [method, at, ...args]);
  return r.affectedRows > 0;
}

const j = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };

/** The shape the panel renders for one stored report. */
function reportView(r, { full = false } = {}) {
  const scores = j(r.scores_json);
  const liabilities = full ? j(r.liabilities_json) : null;
  const slots = String(r.borrower_slots || '1').split(',').map(n => parseInt(n, 10)).filter(Boolean);
  const qualifying = ems.qualifyingScores(scores).map(q => ({ ...q, slot: slots[parseInt(String(q.borrowerId).replace(/\D/g, ''), 10) - 1] || slots[0] || 1 }));
  // A joint report lists a joint account once per borrower — count it once.
  const seen = new Set();
  const allLiab = j(r.liabilities_json).filter(l => { const k = `${String(l.creditor || '').toLowerCase()}|${String(l.accountIdentifier || '').slice(-4)}|${String(l.accountOpenedDate || '').slice(0, 10)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const open = allLiab.filter(l => !/closed|paid|transferred/i.test(l.accountStatus || '') );
  return {
    id: r.id, loan_id: r.loan_id, ems_report_id: r.ems_report_id, request_type: r.request_type, borrower_slots: slots,
    pull_mode: r.pull_mode, action_type: r.action_type, bureaus: r.bureaus,
    ok: r.status_condition === 'Success' && !!r.ems_report_id,
    status_code: r.status_code, status_condition: r.status_condition, status_description: r.status_description,
    friendly: ems.friendly(r.status_code, null),
    requested_by: r.requested_by, created_at: r.created_at,
    has_pdf: !!r.has_pdf, loan_document_id: r.loan_document_id || null,
    scores, qualifying,
    summary: {
      tradelines: allLiab.length, open: open.length,
      balances: open.reduce((a, l) => a + (l.unpaidBalance || 0), 0),
      payments: open.reduce((a, l) => a + (l.monthlyPayment || 0), 0),
      derogatory: allLiab.filter(l => l.derogatory).length,
      inquiries: j(r.inquiries_json).length, publicRecords: j(r.public_records_json).length,
    },
    ...(full ? { liabilities, inquiries: j(r.inquiries_json), publicRecords: j(r.public_records_json) } : {}),
  };
}

const LIST_COLS = `id, loan_id, ems_report_id, request_type, borrower_slots, pull_mode, action_type, bureaus,
  status_code, status_condition, status_description, scores_json, liabilities_json, inquiries_json, public_records_json,
  requested_by, created_at, loan_document_id, (report_pdf IS NOT NULL) AS has_pdf`;

// ── GET /api/credit/config ──────────────────────────────────────────────
router.get('/config', (req, res) => {
  const url = process.env.EMS_URL || ems.EMS_UAT_URL;
  const hardPull = !!(process.env.EMS_ACCOUNT && process.env.EMS_PASSWORD);
  res.json({
    configured: hardPull,
    hardPull,
    softPull: !!(process.env.EMS_SOFT_ACCOUNT && process.env.EMS_SOFT_PASSWORD),
    endpoint: url,
    environment: /uat|test|localhost|127\.0\.0\.1/i.test(url) ? 'UAT' : 'PRODUCTION',
    submittingParty: process.env.EMS_SUBMITTING_PARTY || 'Jammie Mortgage',
    missing: hardPull ? [] : ['EMS_ACCOUNT', 'EMS_PASSWORD'].filter(k => !process.env[k]),
  });
});

// ── GET /api/credit/seats/:loanId ───────────────────────────────────────
router.get('/seats/:loanId', async (req, res) => {
  try {
    const loan = await loadLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const seats = (await loadSeats(loan.id)).map(seatSummary);
    const [[d]] = await db.query("SELECT DATE_FORMAT(credit_score_date,'%Y-%m-%d') AS d FROM loans WHERE id=?", [loan.id]);
    res.json({ loanNumber: loan.loan_number, creditScore: loan.credit_score, creditScoreDate: d?.d || null, creditScoreSource: loan.credit_score_source, creditReportId: loan.credit_report_id, seats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/credit/authorize/:loanId ──────────────────────────────────
const AUTH_METHODS = ['eConsent', 'Wet Signature', 'Verbal (recorded)', 'Written'];
router.post('/authorize/:loanId', async (req, res) => {
  try {
    const loan = await loadLoan(req.params.loanId);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const slot = parseSlots(req.body?.slot ?? 1)[0];
    const method = AUTH_METHODS.includes(req.body?.method) ? req.body.method : null;
    if (!method) return res.status(400).json({ error: `method must be one of: ${AUTH_METHODS.join(', ')}` });
    let at = req.body?.authorizedAt ? new Date(req.body.authorizedAt) : new Date();
    if (isNaN(at.getTime())) at = new Date();
    if (at.getTime() > Date.now() + 60_000) return res.status(400).json({ error: 'Authorization date cannot be in the future' });
    const seats = await loadSeats(loan.id);
    const seat = seats.find(s => s.slot === slot);
    if (!seat) return res.status(404).json({ error: `No borrower on seat ${slot}` });
    const ok = await setAuthorization(loan.id, slot, method, at);
    if (!ok) return res.status(404).json({ error: 'Borrower row not found' });
    await audit({ loanId: loan.id, action: 'Authorize', outcome: 'success', requestedBy: who(req), ip: clientIp(req), ssnLast4: last4(seat.row.ssn),
      detail: `${seatLabel(slot)} authorization recorded by MLO: ${method} on ${at.toISOString().slice(0, 10)}` });
    const fresh = (await loadSeats(loan.id)).map(seatSummary);
    res.json({ ok: true, seats: fresh });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Shared by preview and order: which seats, their rows, the EMS borrower list. */
async function prepare(loanId, body) {
  const loan = await loadLoan(loanId);
  if (!loan) return { error: 'Loan not found', status: 404 };
  const seats = await loadSeats(loan.id);
  if (!seats.length) return { error: 'No borrower application (form 1003) on this loan', status: 400 };
  const slots = parseSlots(body?.slots ?? body?.slot ?? 1);
  const chosen = slots.map(s => seats.find(x => x.slot === s)).filter(Boolean);
  if (chosen.length !== slots.length) return { error: `No borrower on seat ${slots.find(s => !seats.some(x => x.slot === s))}`, status: 404 };
  const mode = body?.mode === 'soft' ? 'soft' : 'hard';
  const bureaus = { equifax: body?.bureaus?.equifax !== false, experian: body?.bureaus?.experian !== false, transunion: body?.bureaus?.transunion !== false };
  if (!bureaus.equifax && !bureaus.experian && !bureaus.transunion) return { error: 'Pick at least one bureau', status: 400 };
  return { loan, seats: chosen, slots, mode, bureaus, borrowers: chosen.map(s => toEmsBorrower(s.row)) };
}

// ── POST /api/credit/preview/:loanId ────────────────────────────────────
// Builds the exact XML that WOULD be sent, without sending it.
router.post('/preview/:loanId', async (req, res) => {
  try {
    const p = await prepare(req.params.loanId, req.body);
    if (p.error) return res.status(p.status).json({ error: p.error });
    const { xml } = ems.buildSubmitRequest({ loanNumber: p.loan.loan_number, requestedBy: req.body?.requestedBy || who(req) || 'Jammie', borrowers: p.borrowers, bureaus: p.bureaus, mode: p.mode });
    res.json({ ok: true, requestXml: ems.redact(xml), seats: p.seats.map(seatSummary) });
  } catch (e) {
    res.status(e.code === 'EMS_VALIDATION' ? 422 : e.code === 'EMS_NOT_CONFIGURED' ? 503 : 500).json({ error: e.message, problems: e.problems });
  }
});

// ── POST /api/credit/order/:loanId ──────────────────────────────────────
router.post('/order/:loanId', async (req, res) => {
  const requestedBy = req.body?.requestedBy || who(req) || null;
  const ip = clientIp(req);
  const p = await prepare(req.params.loanId, req.body);
  if (p.error) return res.status(p.status).json({ error: p.error });
  const { loan, seats, slots, mode, bureaus, borrowers } = p;
  const loanId = loan.id;
  const ssn4 = last4(seats[0].row.ssn);

  // ── 1. Authorization gate — every seat on the order ──
  const unauthorized = seats.filter(s => !s.row.credit_pull_authorized_at);
  if (unauthorized.length) {
    const names = unauthorized.map(s => seatLabel(s.slot)).join(', ');
    await audit({ loanId, mode, outcome: 'refused_no_auth', requestedBy, ip, ssnLast4: ssn4, detail: `${names}: credit pull not authorized (credit_pull_authorized_at is empty)` });
    return res.status(403).json({ error: `Credit pull not authorized for ${names}`, hint: 'Record the borrower\'s authorization in the Credit Report panel before ordering.' });
  }

  // ── 2. Build and send ──
  let result;
  try {
    result = await ems.submitCredit({ loanNumber: loan.loan_number, requestedBy: requestedBy || 'Jammie', borrowers, bureaus, mode });
  } catch (e) {
    const outcome = e.code === 'EMS_VALIDATION' || e.code === 'EMS_NOT_CONFIGURED' ? 'validation_error' : 'transport_error';
    await audit({ loanId, mode, outcome, detail: e.message, requestedBy, ip, ssnLast4: ssn4 });
    return res.status(e.code === 'EMS_VALIDATION' ? 422 : e.code === 'EMS_NOT_CONFIGURED' ? 503 : 502).json({ error: e.message, problems: e.problems });
  }

  // ── 3. Store the result (success or EMS-level error) ──
  const bureauList = ['equifax', 'experian', 'transunion'].filter(b => bureaus[b]).map(b => ({ equifax: 'EFX', experian: 'XPN', transunion: 'TU' })[b]).join(',');
  const [ins] = await db.query('INSERT INTO credit_reports SET ?', {
    loan_id: loanId,
    ems_report_id: result.reportId,
    request_type: slots.length === 2 ? 'Joint' : 'Individual',
    borrower_slots: slots.join(','),
    pull_mode: mode,
    action_type: 'Submit',
    bureaus: bureauList,
    status_code: result.status.code,
    status_condition: result.status.condition,
    status_description: (result.status.description || result.errors.join(' | ')).slice(0, 255),
    scores_json: result.ok ? JSON.stringify(result.scores) : null,
    liabilities_json: result.ok ? JSON.stringify(result.liabilities) : null,
    inquiries_json: result.ok ? JSON.stringify(result.inquiries) : null,
    public_records_json: result.ok ? JSON.stringify(result.publicRecords) : null,
    report_pdf: result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64') : null,
    raw_response_xml: result.raw,
    request_xml: result.requestXml,
    requested_by: requestedBy,
    requested_by_mlo_id: req.user?.id || null,
  });

  await audit({ loanId, creditReportId: ins.insertId, mode, requestedBy, ip, ssnLast4: ssn4,
    outcome: result.ok ? 'success' : 'ems_error',
    detail: result.ok ? `EMS order ${result.reportId} (${slots.length === 2 ? 'Joint' : 'Individual'}, ${bureauList})` : `${result.status.code}: ${result.errors.join(' | ')}` });

  // ── 4. Respond (never the raw XML, never the SSN) ──
  const [[row]] = await db.query(`SELECT ${LIST_COLS} FROM credit_reports WHERE id=?`, [ins.insertId]);
  const view = reportView(row, { full: true });
  res.status(result.ok ? 201 : 422).json({ ...view, errors: result.errors, durationMs: result.durationMs, friendly: ems.friendly(result.status.code, null) });
});

// ── GET /api/credit/loan/:loanId ────────────────────────────────────────
router.get('/loan/:loanId', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT ${LIST_COLS} FROM credit_reports WHERE loan_id=? ORDER BY created_at DESC, id DESC`, [req.params.loanId]);
    res.json(rows.map(r => reportView(r)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/credit/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[r]] = await db.query(`SELECT ${LIST_COLS} FROM credit_reports WHERE id=?`, [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.json(reportView(r, { full: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/credit/:id/pdf ─────────────────────────────────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT report_pdf, ems_report_id FROM credit_reports WHERE id=?', [req.params.id]);
    if (!rows[0] || !rows[0].report_pdf) return res.status(404).json({ error: 'No PDF stored for this report' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="credit_${rows[0].ems_report_id || req.params.id}.pdf"`);
    res.send(rows[0].report_pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/credit/:id/raw ─────────────────────────────────────────────
// For the request/response view and UAT evidence. Password and SSNs redacted.
router.get('/:id/raw', async (req, res) => {
  try {
    const [[r]] = await db.query('SELECT request_xml, raw_response_xml FROM credit_reports WHERE id=?', [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.json({ request_xml: ems.redact(r.request_xml || ''), response_xml: ems.redact(r.raw_response_xml || '') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/credit/:id/attach-pdf ─────────────────────────────────────
router.post('/:id/attach-pdf', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[r]] = await db.query('SELECT loan_id, ems_report_id, borrower_slots, request_type, report_pdf IS NOT NULL AS has_pdf, LENGTH(report_pdf) AS size, loan_document_id FROM credit_reports WHERE id=?', [id]);
    if (!r) return res.status(404).json({ error: 'Report not found' });
    if (!r.has_pdf) return res.status(404).json({ error: 'This report has no PDF' });
    if (r.loan_document_id) return res.json({ ok: true, loanDocumentId: r.loan_document_id, already: true });
    const slots = String(r.borrower_slots || '1').split(',').map(n => parseInt(n, 10)).filter(Boolean);
    const name = `Credit Report - ${slots.map(seatLabel).join(' + ')} - ${r.ems_report_id || id} - ${new Date().toISOString().slice(0, 10)}.pdf`;
    const [ins] = await db.query('INSERT INTO loan_documents SET ?', { loan_id: r.loan_id, mlo_id: req.user?.id || null, file_name: name, file_type: 'application/pdf', file_size_bytes: r.size, gcs_object_path: null, doc_source: 'credit', source_ref_id: id });
    await db.query('UPDATE credit_reports SET loan_document_id=? WHERE id=?', [ins.insertId, id]);
    res.json({ ok: true, loanDocumentId: ins.insertId, fileName: name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/credit/:id/use-score ──────────────────────────────────────
// Copies a borrower's qualifying score from this report onto the loan
// (loans.credit_score, the header SCORE) and records where it came from.
router.post('/:id/use-score', async (req, res) => {
  try {
    const [[r]] = await db.query(`SELECT ${LIST_COLS} FROM credit_reports WHERE id=?`, [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Report not found' });
    const view = reportView(r);
    if (!view.ok) return res.status(400).json({ error: 'This report has no scores' });
    const borrowerId = req.body?.borrowerId || 'B1';
    const q = view.qualifying.find(x => x.borrowerId === borrowerId) || view.qualifying[0];
    if (!q) return res.status(400).json({ error: 'No score for that borrower on this report' });
    const source = `EMS ${r.ems_report_id} - ${q.basis} (${q.bureau})`.slice(0, 80);
    await db.query('UPDATE loans SET credit_score=?, credit_score_date=(SELECT DATE(created_at) FROM credit_reports WHERE id=?), credit_score_source=?, credit_report_id=? WHERE id=?', [q.qualifying, r.id, source, r.id, r.loan_id]);
    const [[l]] = await db.query("SELECT credit_score, DATE_FORMAT(credit_score_date,'%Y-%m-%d') AS d FROM loans WHERE id=?", [r.loan_id]);
    await audit({ loanId: r.loan_id, creditReportId: r.id, action: 'UseScore', mode: r.pull_mode, outcome: 'success', requestedBy: who(req), ip: clientIp(req), detail: `${q.qualifying} (${source}) set as qualifying score` });
    res.json({ ok: true, creditScore: l.credit_score, creditScoreDate: l.d, creditScoreSource: source, creditReportId: r.id, qualifying: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/credit/:id/reparse ───────────────────────────────────────
// Re-run the parser over the stored raw XML. Free (no EMS call). Useful
// when a parser fix lands after a report was already retrieved.
router.post('/:id/reparse', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, raw_response_xml FROM credit_reports WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
    if (!rows[0].raw_response_xml) return res.status(400).json({ error: 'No raw response stored for this report' });
    const result = ems.parseResponse(rows[0].raw_response_xml);
    await db.query('UPDATE credit_reports SET ? WHERE id=?', [{
      ems_report_id: result.reportId,
      status_code: result.status.code, status_condition: result.status.condition,
      status_description: (result.status.description || '').slice(0, 255),
      scores_json: result.ok ? JSON.stringify(result.scores) : null,
      liabilities_json: result.ok ? JSON.stringify(result.liabilities) : null,
      inquiries_json: result.ok ? JSON.stringify(result.inquiries) : null,
      public_records_json: result.ok ? JSON.stringify(result.publicRecords) : null,
      ...(result.pdfBase64 ? { report_pdf: Buffer.from(result.pdfBase64, 'base64') } : {}),
    }, rows[0].id]);
    const [[r]] = await db.query(`SELECT ${LIST_COLS} FROM credit_reports WHERE id=?`, [rows[0].id]);
    res.json({ ...reportView(r, { full: true }), errors: result.errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/credit/:id/retrieve ───────────────────────────────────────
// Free reprint by EMS order number. Useful if the original response was
// lost, or to refresh the stored PDF.
router.post('/:id/retrieve', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM credit_reports WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
    const r = rows[0];
    if (!r.ems_report_id) return res.status(400).json({ error: 'No EMS order number on this report' });
    // Retrieve is structurally identical to Submit, so it needs the same
    // borrower block the original order was built from.
    const p = await prepare(r.loan_id, { slots: r.borrower_slots || '1', mode: r.pull_mode });
    if (p.error) return res.status(p.status).json({ error: p.error });

    const result = await ems.retrieveCredit({ reportId: r.ems_report_id, loanNumber: p.loan.loan_number, requestedBy: who(req) || 'Jammie', borrowers: p.borrowers, mode: r.pull_mode });
    if (result.ok) {
      await db.query('UPDATE credit_reports SET ? WHERE id=?', [{
        scores_json: JSON.stringify(result.scores), liabilities_json: JSON.stringify(result.liabilities),
        inquiries_json: JSON.stringify(result.inquiries), public_records_json: JSON.stringify(result.publicRecords),
        report_pdf: result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64') : r.report_pdf,
        raw_response_xml: result.raw, request_xml: result.requestXml,
      }, r.id]);
    }
    await audit({ loanId: r.loan_id, creditReportId: r.id, action: 'Retrieve', mode: r.pull_mode, requestedBy: who(req), ip: clientIp(req),
      outcome: result.ok ? 'success' : 'ems_error', detail: result.ok ? `Retrieved ${r.ems_report_id}` : result.errors.join(' | ') });
    const [[fresh]] = await db.query(`SELECT ${LIST_COLS} FROM credit_reports WHERE id=?`, [r.id]);
    res.status(result.ok ? 200 : 422).json({ ...reportView(fresh, { full: true }), retrieved: result.ok, errors: result.errors, friendly: ems.friendly(result.status.code, null) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
// For server/scripts/ems-uat.cjs (same seat loading and borrower mapping as the routes).
module.exports.helpers = { loadLoan, loadSeats, toEmsBorrower, seatLabel, seatSummary };
