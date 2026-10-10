'use strict';
/**
 * server/routes/twn.cjs — The Work Number verifications (MLO side).
 *
 * Mounted at /api/twn, behind the auth gate (MLO sessions only).
 *
 *   GET  /api/twn/config                  env, endpoint, whether the cert/credentials load (no secrets)
 *   GET  /api/twn/templates               ask Equifax which TEMPLATE_NAMEs this account may use
 *   POST /api/twn/preview/:loanId         build the request for a borrower seat without sending it
 *   POST /api/twn/order/:loanId           { slot, authorized, authMethod, employerName?, salaryKey?,
 *                                           filter?, template?, pdf?, altSearch? }
 *                                         order a verification; stores everything; returns the summary
 *   GET  /api/twn/loan/:loanId            verifications for the loan (newest first) with employments
 *   GET  /api/twn/:id                     one verification (summary + employments)
 *   GET  /api/twn/:id/pdf                 the embedded PDF, if one was returned
 *   GET  /api/twn/:id/raw                 request (password redacted) + response XML, for Equifax's UAT log
 *   POST /api/twn/:id/attach-pdf          list the PDF in the loan's Documents tab
 *   POST /api/twn/reverify/:employmentId  re-verify one employer record (SRVRTID)
 *
 * A verification is a consumer report. The order route refuses unless the
 * caller attests the borrower authorized it (or the Phase 4 consent exists),
 * and every attempt — success, Equifax error, transport failure, refusal —
 * leaves a twn_verifications row.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const twn     = require('../lib/twn.cjs');

const last4 = v => String(v || '').replace(/\D/g, '').slice(-4) || null;
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || '').trim() || req.ip || null;

async function loadSeat(loanId, slot) {
  const [[loan]] = await db.query('SELECT id, loan_number, borrower, application_status FROM loans WHERE id=?', [loanId]);
  if (!loan) return { error: 'Loan not found', status: 404 };
  let row;
  if (slot === 1) {
    [[row]] = await db.query('SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY id LIMIT 1', [loanId]);
  } else {
    [[row]] = await db.query('SELECT * FROM form_1003_coborrowers WHERE loan_id=? AND slot=?', [loanId, slot]);
  }
  if (!row) return { error: slot === 1 ? 'This loan has no Borrower Info yet' : `No co-borrower on seat ${slot}`, status: 404 };
  return { loan, row };
}

/** What we send about the borrower, from the 1003 row. */
function subjectFrom(row, body = {}) {
  return {
    ssn: body.ssn || row.ssn || '',
    firstName: body.firstName || row.first_nm || '',
    middleName: body.middleName || row.middle_nm || '',
    lastName: body.lastName || row.last_nm || '',
    addr1: row.address_street || '', addr2: row.address_unit || '', city: row.address_city || '', state: row.address_state || '', postalCode: row.address_zip || '',
    dob: row.dob ? new Date(row.dob).toISOString().slice(0, 10) : '',
  };
}

function buildOpts({ loan, row, body, user }) {
  const s = subjectFrom(row, body);
  const alt = !!body.altSearch;                       // search by name + address + DOB instead of SSN
  return {
    loanNumber: loan.loan_number,
    ssn: alt ? '' : s.ssn,
    employeeId: body.employeeId || '',
    firstName: s.firstName, middleName: s.middleName, lastName: s.lastName,
    addr1: alt ? s.addr1 : '', addr2: alt ? s.addr2 : '', city: alt ? s.city : '', state: alt ? s.state : '', postalCode: alt ? s.postalCode : '', dob: alt ? s.dob : '',
    employerName: body.employerName || '', employerCode: body.employerCode || '',
    salaryKey: body.salaryKey || '',
    filter: body.filter || undefined, template: body.template || undefined,
    pdf: body.pdf !== false,
    endUser: user?.email || user?.username || 'jammie',
    searchMode: alt ? 'search_match' : (body.employeeId ? 'alt_id' : 'ssn'),
  };
}

async function storeVerification({ loanId, slot, opts, result, outcome, errorText, user, body, ip, requestType = 'select' }) {
  const parsed = result?.parsed || null;
  const pdf = result?.pdf || null;
  const [ins] = await db.query('INSERT INTO twn_verifications SET ?', {
    loan_id: loanId, borrower_slot: slot, env: result?.env || twn.config().env, request_type: requestType,
    trnuid: opts?.loanNumber || null, purpose_code: twn.config().purpose,
    status_filter: opts?.filter || twn.config().filter, template_name: opts?.template || twn.config().template || null,
    search_mode: opts?.searchMode || null, ssn_last4: last4(opts?.ssn), employer_name_sent: opts?.employerName || null,
    salary_key_used: opts?.salaryKey ? 1 : 0, pdf_requested: opts?.pdf ? 1 : 0,
    signon_code: parsed?.signon?.code || null, status_code: parsed?.status?.code || null, status_severity: parsed?.status?.severity || null,
    status_message: (parsed?.status?.message || parsed?.status?.friendly || '').slice(0, 255) || null,
    master_srvrtid: parsed?.masterSrvrtid || null, employer_count: parsed?.employments?.length || 0,
    price: parsed?.price ?? null, product_name: parsed?.productName || null,
    outcome, error_text: errorText ? String(errorText).slice(0, 500) : null,
    http_status: result?.httpStatus || null, duration_ms: result?.durationMs || null,
    request_xml: result?.requestXml || null, response_xml: result?.responseXml || null,
    parsed_json: parsed ? JSON.stringify(parsed) : null,
    report_pdf: pdf ? pdf.bytes : null, pdf_file_name: pdf ? pdf.name : null,
    requested_by_mlo_id: user?.id || null, requested_by: user?.email || user?.name || null,
    auth_method: body?.authMethod || (body?.authorized ? 'mlo_attest' : null), authorized_at: body?.authorized ? new Date() : null, ip,
  });
  const id = ins.insertId;
  for (const e of (parsed?.employments || [])) {
    await db.query('INSERT INTO twn_employments SET ?', {
      verification_id: id, loan_id: loanId, borrower_slot: slot, srvrtid: e.srvrtid,
      employer_code: e.employer.code, employer_name: e.employer.name, employer_city: e.employer.city, employer_state: e.employer.state,
      position_title: e.employee.position, status_code: e.status.code || null, status_text: e.status.message || null, status_type: e.status.type,
      dt_info: e.dates.info, dt_hire: e.dates.hire, dt_original_hire: e.dates.originalHire, dt_end: e.dates.end, dt_most_recent_pay: e.dates.mostRecentPay,
      length_of_service_months: e.lengthOfServiceMonths,
      pay_frequency_code: e.base.payFrequency.code || null, pay_frequency: e.base.payFrequency.message || null,
      rate_of_pay: e.base.rateOfPay, avg_hours_per_period: e.base.avgHoursPerPeriod,
      pay_period_code: e.base.payPeriod.code || null, pay_period: e.base.payPeriod.message || null,
      monthly_base_est: e.monthlyBaseEstimate, projected_income: e.projectedIncome,
      ytd_total: e.ytdTotal, prior_year_total: e.priorYearTotal, prior_year2_total: e.priorYear2Total,
      annual_json: JSON.stringify(e.annual), completeness: e.completeness, fcra_blocked: e.fcraBlocked ? 1 : 0,
      disclaimers_json: JSON.stringify(e.disclaimers),
    });
  }
  return id;
}

async function summary(id) {
  const [[v]] = await db.query('SELECT id, loan_id, borrower_slot, env, request_type, trnuid, status_filter, template_name, search_mode, ssn_last4, employer_name_sent, salary_key_used, pdf_requested, signon_code, status_code, status_severity, status_message, master_srvrtid, employer_count, price, product_name, outcome, error_text, http_status, duration_ms, (report_pdf IS NOT NULL) AS has_pdf, pdf_file_name, loan_document_id, requested_by, auth_method, authorized_at, created_at FROM twn_verifications WHERE id=?', [id]);
  if (!v) return null;
  const [emps] = await db.query('SELECT * FROM twn_employments WHERE verification_id=? ORDER BY id', [id]);
  const [[p]] = await db.query('SELECT parsed_json FROM twn_verifications WHERE id=?', [id]);
  let friendly = null; try { friendly = JSON.parse(p.parsed_json || 'null')?.status?.friendly || null; } catch {}
  return { ...v, has_pdf: !!v.has_pdf, friendly, employments: emps.map(e => ({ ...dateCols(e), annual: safe(e.annual_json, []), disclaimers: safe(e.disclaimers_json, []) })) };
}
const safe = (s, fb) => { try { return JSON.parse(s ?? 'null') ?? fb; } catch { return fb; } };
// DATE columns come back as JS Dates at local midnight; hand the UI plain YYYY-MM-DD.
const ymdLocal = d => (d instanceof Date) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : d;
function dateCols(e) { const o = { ...e }; for (const k of ['dt_info', 'dt_hire', 'dt_original_hire', 'dt_end', 'dt_most_recent_pay']) o[k] = ymdLocal(o[k]); return o; }

// ── routes ──────────────────────────────────────────────────────────────
router.get('/config', (req, res) => res.json(twn.publicConfig()));

router.get('/templates', async (req, res) => {
  try {
    const r = await twn.listTemplates({ loanNumber: req.query.loanNumber || 'TEMPLATES' });
    res.json({ ok: r.parsed.ok, status: r.parsed.status, signon: r.parsed.signon, templates: r.parsed.templates, env: r.env, durationMs: r.durationMs, requestXml: r.requestXml, responseXml: r.responseXml });
  } catch (e) { res.status(e.code === 'TWN_NOT_CONFIGURED' ? 503 : 502).json({ error: e.message, code: e.code }); }
});

router.post('/preview/:loanId', async (req, res) => {
  try {
    const slot = Number(req.body?.slot) || 1;
    const { loan, row, error, status } = await loadSeat(Number(req.params.loanId), slot);
    if (error) return res.status(status).json({ error });
    const opts = buildOpts({ loan, row, body: req.body || {}, user: req.user });
    const xml = twn.buildSelectRequest(opts);
    res.json({ ok: true, requestXml: twn.redact(xml), subject: { ...subjectFrom(row), ssn: last4(row.ssn) ? `•••-••-${last4(row.ssn)}` : '' }, config: twn.publicConfig() });
  } catch (e) { res.status(e.code === 'TWN_VALIDATION' ? 422 : 500).json({ error: e.message, problems: e.problems }); }
});

router.post('/order/:loanId', async (req, res) => {
  const loanId = Number(req.params.loanId);
  const body = req.body || {};
  const slot = Number(body.slot) || 1;
  const ip = clientIp(req);
  const { loan, row, error, status } = await loadSeat(loanId, slot);
  if (error) return res.status(status).json({ error });

  // 1. authorization gate — the MLO attests, or (Phase 4) the borrower's recorded consent
  const consent = row.credit_pull_authorized_at || null;
  if (!body.authorized && !consent) {
    await storeVerification({ loanId, slot, opts: { loanNumber: loan.loan_number, ssn: row.ssn }, result: null, outcome: 'refused_no_auth', errorText: 'Borrower authorization not attested', user: req.user, body, ip });
    return res.status(403).json({ error: 'Verification not authorized', hint: 'Confirm the borrower authorized an employment/income verification before ordering.' });
  }
  if (consent && !body.authMethod) body.authMethod = 'borrower_consent';

  // 2. build + send
  const opts = buildOpts({ loan, row, body, user: req.user });
  let result;
  try {
    result = await twn.verify(opts);
  } catch (e) {
    const outcome = e.code === 'TWN_VALIDATION' ? 'validation_error' : e.code === 'TWN_NOT_CONFIGURED' ? 'validation_error' : 'transport_error';
    const id = await storeVerification({ loanId, slot, opts, result: { requestXml: e.code === 'TWN_VALIDATION' ? null : safeBuild(opts), httpStatus: e.httpStatus, durationMs: e.durationMs }, outcome, errorText: e.message, user: req.user, body, ip });
    return res.status(e.code === 'TWN_VALIDATION' ? 422 : e.code === 'TWN_NOT_CONFIGURED' ? 503 : 502).json({ error: e.message, problems: e.problems, code: e.code, verificationId: id });
  }

  // 3. store + answer
  const outcome = result.parsed.ok ? 'ok' : 'twn_error';
  const id = await storeVerification({ loanId, slot, opts, result, outcome, errorText: result.parsed.ok ? null : result.parsed.status.friendly, user: req.user, body, ip });
  const s = await summary(id);
  res.status(result.parsed.ok ? 200 : 422).json({ ok: result.parsed.ok, verification: s, status: result.parsed.status, signon: result.parsed.signon });
});
function safeBuild(opts) { try { return twn.redact(twn.buildSelectRequest(opts)); } catch { return null; } }

router.get('/loan/:loanId', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id FROM twn_verifications WHERE loan_id=? ORDER BY id DESC LIMIT 50', [Number(req.params.loanId)]);
    const out = [];
    for (const r of rows) out.push(await summary(r.id));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/pdf', async (req, res) => {
  const [[v]] = await db.query('SELECT report_pdf, pdf_file_name, loan_id FROM twn_verifications WHERE id=?', [Number(req.params.id)]);
  if (!v || !v.report_pdf) return res.status(404).json({ error: 'No PDF for this verification' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(v.pdf_file_name || `twn-${v.loan_id}-${req.params.id}.pdf`).replace(/"/g, '')}"`);
  res.send(v.report_pdf);
});

router.get('/:id/raw', async (req, res) => {
  const [[v]] = await db.query('SELECT id, request_xml, response_xml, outcome, status_code, created_at FROM twn_verifications WHERE id=?', [Number(req.params.id)]);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

router.post('/:id/attach-pdf', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[v]] = await db.query('SELECT loan_id, borrower_slot, pdf_file_name, report_pdf IS NOT NULL AS has_pdf, LENGTH(report_pdf) AS size, loan_document_id FROM twn_verifications WHERE id=?', [id]);
    if (!v) return res.status(404).json({ error: 'Not found' });
    if (!v.has_pdf) return res.status(404).json({ error: 'This verification has no PDF' });
    if (v.loan_document_id) return res.json({ ok: true, loanDocumentId: v.loan_document_id, already: true });
    const name = `The Work Number - ${v.borrower_slot === 1 ? 'Borrower' : 'Co-Borrower ' + (v.borrower_slot - 1)} - ${new Date().toISOString().slice(0, 10)}.pdf`;
    const [ins] = await db.query('INSERT INTO loan_documents SET ?', { loan_id: v.loan_id, mlo_id: req.user?.id || null, file_name: name, file_type: 'application/pdf', file_size_bytes: v.size, gcs_object_path: null, doc_source: 'twn', source_ref_id: id });
    await db.query('UPDATE twn_verifications SET loan_document_id=? WHERE id=?', [ins.insertId, id]);
    res.json({ ok: true, loanDocumentId: ins.insertId, fileName: name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  const s = await summary(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

router.post('/reverify/:employmentId', async (req, res) => {
  try {
    const [[e]] = await db.query('SELECT e.*, v.ssn_last4, l.loan_number FROM twn_employments e JOIN twn_verifications v ON v.id=e.verification_id JOIN loans l ON l.id=e.loan_id WHERE e.id=?', [Number(req.params.employmentId)]);
    if (!e) return res.status(404).json({ error: 'Not found' });
    const { row } = await loadSeat(e.loan_id, e.borrower_slot);
    const opts = { loanNumber: e.loan_number, ssn: row?.ssn || '', srvrtid: e.srvrtid };
    const r = await twn.reverify(opts);
    const id = await storeVerification({ loanId: e.loan_id, slot: e.borrower_slot, opts: { ...opts, searchMode: 'ssn' }, result: r, outcome: r.parsed.ok ? 'ok' : 'twn_error', errorText: r.parsed.ok ? null : r.parsed.status.friendly, user: req.user, body: { authorized: true, authMethod: 'mlo_attest' }, ip: clientIp(req), requestType: 'reverify' });
    res.status(r.parsed.ok ? 200 : 422).json({ ok: r.parsed.ok, verification: await summary(id), status: r.parsed.status });
  } catch (e) { res.status(e.code === 'TWN_NOT_CONFIGURED' ? 503 : 502).json({ error: e.message, code: e.code }); }
});

module.exports = router;
