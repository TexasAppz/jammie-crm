'use strict';
/**
 * server/routes/credit.cjs
 *
 * Orders and retrieves credit reports through Equifax Mortgage Solutions.
 *
 * ROUTES
 *   GET  /api/credit/config           -> which EMS credential sets are configured (no secrets)
 *   POST /api/credit/preview/:loanId  -> build the request XML WITHOUT sending it (dev aid)
 *   POST /api/credit/order/:loanId    -> order a report  { mode:'hard'|'soft', bureaus:{...} }
 *   GET  /api/credit/loan/:loanId     -> list stored reports for a loan
 *   GET  /api/credit/:id              -> one stored report (parsed)
 *   GET  /api/credit/:id/pdf          -> the human-readable PDF
 *   POST /api/credit/:id/retrieve     -> re-fetch from EMS by order number (free reprint)
 *
 * SAFEGUARDS — these are not optional for consumer report data
 *   1. AUTHORIZATION GATE. The order route refuses unless the borrower's
 *      credit_pull_authorized_at is set. Ordering credit without a
 *      permissible purpose is an FCRA violation with statutory damages.
 *   2. AUDIT. Every attempt is written to credit_pull_audit, including
 *      refusals and failures — never just successes.
 *   3. SSN HANDLING. The full SSN goes to EMS in the request and nowhere
 *      else. Audit rows store the last 4 only. The stored raw response
 *      contains the SSN as EMS echoes it, which is why raw_response_xml
 *      is retained for dispute handling but never returned by the API.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const ems     = require('../lib/ems.cjs');

const last4 = ssn => String(ssn || '').replace(/\D/g, '').slice(-4) || null;

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

// Map Jammie's form_1003 row -> the borrower shape ems.cjs expects.
function toEmsBorrower(f, coBorrower = false) {
  if (!coBorrower) {
    return {
      firstName: f.first_nm, middleName: f.middle_nm, lastName: f.last_nm, suffix: f.suffix,
      ssn: f.ssn, dob: f.dob,
      residence: {
        street: [f.address_num, f.address_street].filter(Boolean).join(' '),
        city: f.address_city,
        // Jammie stores state names ("Georgia"); EMS wants "GA".
        state: stateCode(f.address_state),
        zip: f.address_zip,
        years: f.current_how_long_addr,
      },
    };
  }
  return {
    firstName: f.first_nm_borrower_2, lastName: f.last_nm_borrower_2,
    ssn: f.ssn_borrower_2, dob: f.dob_borrower_2,
    // Co-borrower residence defaults to the primary's when not separately stored
    residence: {
      street: [f.address_num, f.address_street].filter(Boolean).join(' '),
      city: f.address_city, state: stateCode(f.address_state), zip: f.address_zip,
    },
  };
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

async function loadLoanAndBorrower(loanId) {
  const [loans] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
  if (!loans[0]) return { error: 'Loan not found', status: 404 };
  const [forms] = await db.query(
    'SELECT * FROM form_1003_main_borrower WHERE loan_id=? ORDER BY updated_at DESC LIMIT 1', [loanId]);
  if (!forms[0]) return { error: 'No borrower application (form 1003) on this loan', status: 400 };
  return { loan: loans[0], form: forms[0] };
}

// ── GET /api/credit/config ──────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    hardPull: !!(process.env.EMS_ACCOUNT && process.env.EMS_PASSWORD),
    softPull: !!(process.env.EMS_SOFT_ACCOUNT && process.env.EMS_SOFT_PASSWORD),
    endpoint: process.env.EMS_URL || ems.EMS_UAT_URL,
    environment: /uat/i.test(process.env.EMS_URL || ems.EMS_UAT_URL) ? 'UAT' : 'PRODUCTION',
    submittingParty: process.env.EMS_SUBMITTING_PARTY || 'Jammie Mortgage',
  });
});

// ── POST /api/credit/preview/:loanId ────────────────────────────────────
// Builds the exact XML that WOULD be sent, without sending it. Useful for
// checking a request against the guide before spending a pull.
router.post('/preview/:loanId', async (req, res) => {
  try {
    const { loan, form, error, status } = await loadLoanAndBorrower(req.params.loanId);
    if (error) return res.status(status).json({ error });
    const borrowers = [toEmsBorrower(form)];
    if (req.body?.joint && form.first_nm_borrower_2) borrowers.push(toEmsBorrower(form, true));
    const { xml } = ems.buildSubmitRequest({
      loanNumber: loan.loan_number, requestedBy: req.body?.requestedBy || 'Jammie',
      borrowers, bureaus: req.body?.bureaus, mode: req.body?.mode || 'hard',
    });
    // Redact the password before returning the preview
    res.type('text/xml').send(xml.replace(/LoginAccountPassword="[^"]*"/, 'LoginAccountPassword="***"'));
  } catch (e) {
    res.status(e.code === 'EMS_VALIDATION' ? 422 : 500).json({ error: e.message, problems: e.problems });
  }
});

// ── POST /api/credit/order/:loanId ──────────────────────────────────────
router.post('/order/:loanId', async (req, res) => {
  const loanId = req.params.loanId;
  const mode = req.body?.mode === 'soft' ? 'soft' : 'hard';
  const requestedBy = req.body?.requestedBy || null;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;

  const { loan, form, error, status } = await loadLoanAndBorrower(loanId);
  if (error) return res.status(status).json({ error });

  // ── 1. Authorization gate ──
  if (!form.credit_pull_authorized_at) {
    await audit({ loanId, mode, outcome: 'refused_no_auth', requestedBy, ip, ssnLast4: last4(form.ssn),
      detail: 'Borrower has not authorized a credit pull (credit_pull_authorized_at is empty)' });
    return res.status(403).json({
      error: 'Credit pull not authorized',
      hint: 'Record the borrower\'s authorization on Borrower Info before ordering credit.',
    });
  }

  // ── 2. Build and validate ──
  const borrowers = [toEmsBorrower(form)];
  const joint = !!(req.body?.joint && form.first_nm_borrower_2);
  if (joint) borrowers.push(toEmsBorrower(form, true));

  let result;
  try {
    result = await ems.submitCredit({
      loanNumber: loan.loan_number, requestedBy: requestedBy || 'Jammie',
      borrowers, bureaus: req.body?.bureaus, mode,
    });
  } catch (e) {
    const outcome = e.code === 'EMS_VALIDATION' ? 'validation_error'
                  : e.code === 'EMS_NOT_CONFIGURED' ? 'validation_error' : 'transport_error';
    await audit({ loanId, mode, outcome, detail: e.message, requestedBy, ip, ssnLast4: last4(form.ssn) });
    return res.status(e.code === 'EMS_VALIDATION' ? 422 : e.code === 'EMS_NOT_CONFIGURED' ? 503 : 502)
              .json({ error: e.message, problems: e.problems });
  }

  // ── 3. Store the result (success or EMS-level error) ──
  const bureaus = req.body?.bureaus || {};
  const bureauList = ['equifax','experian','transunion'].filter(b => bureaus[b] !== false)
                       .map(b => ({ equifax:'EFX', experian:'XPN', transunion:'TU' })[b]).join(',');
  const [ins] = await db.query('INSERT INTO credit_reports SET ?', {
    loan_id: loanId,
    ems_report_id: result.reportId,
    request_type: joint ? 'Joint' : 'Individual',
    pull_mode: mode,
    action_type: 'Submit',
    bureaus: bureauList,
    status_code: result.status.code,
    status_condition: result.status.condition,
    status_description: result.status.description || result.errors.join(' | ').slice(0, 255),
    scores_json: result.ok ? JSON.stringify(result.scores) : null,
    liabilities_json: result.ok ? JSON.stringify(result.liabilities) : null,
    inquiries_json: result.ok ? JSON.stringify(result.inquiries) : null,
    public_records_json: result.ok ? JSON.stringify(result.publicRecords) : null,
    report_pdf: result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64') : null,
    raw_response_xml: result.raw,
    requested_by: requestedBy,
  });

  await audit({ loanId, creditReportId: ins.insertId, mode, requestedBy, ip, ssnLast4: last4(form.ssn),
    outcome: result.ok ? 'success' : 'ems_error',
    detail: result.ok ? `EMS order ${result.reportId}` : `${result.status.code}: ${result.errors.join(' | ')}` });

  // ── 4. Respond (never the raw XML, never the SSN) ──
  res.status(result.ok ? 201 : 422).json({
    id: ins.insertId,
    ok: result.ok,
    reportId: result.reportId,
    status: result.status,
    errors: result.errors,
    scores: result.scores || [],
    liabilities: result.liabilities || [],
    inquiries: result.inquiries || [],
    publicRecords: result.publicRecords || [],
    hasPdf: !!result.pdfBase64,
  });
});

// ── GET /api/credit/loan/:loanId ────────────────────────────────────────
router.get('/loan/:loanId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, ems_report_id, request_type, pull_mode, action_type, bureaus,
              status_code, status_condition, status_description, requested_by, created_at,
              (report_pdf IS NOT NULL) AS has_pdf
         FROM credit_reports WHERE loan_id=? ORDER BY created_at DESC`, [req.params.loanId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/credit/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, loan_id, ems_report_id, request_type, pull_mode, bureaus, status_code,
              status_condition, status_description, scores_json, liabilities_json,
              inquiries_json, public_records_json, requested_by, created_at,
              (report_pdf IS NOT NULL) AS has_pdf
         FROM credit_reports WHERE id=?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Report not found' });
    const r = rows[0];
    const j = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
    res.json({ ...r, scores: j(r.scores_json), liabilities: j(r.liabilities_json),
      inquiries: j(r.inquiries_json), publicRecords: j(r.public_records_json),
      scores_json: undefined, liabilities_json: undefined, inquiries_json: undefined, public_records_json: undefined });
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
      status_description: result.status.description,
      scores_json: result.ok ? JSON.stringify(result.scores) : null,
      liabilities_json: result.ok ? JSON.stringify(result.liabilities) : null,
      inquiries_json: result.ok ? JSON.stringify(result.inquiries) : null,
      public_records_json: result.ok ? JSON.stringify(result.publicRecords) : null,
      report_pdf: result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64') : undefined,
    }, rows[0].id]);
    res.json({ ok: result.ok, reportId: result.reportId, status: result.status, errors: result.errors,
      scores: result.scores || [], liabilities: result.liabilities || [],
      inquiries: result.inquiries || [], publicRecords: result.publicRecords || [], hasPdf: !!result.pdfBase64 });
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
    const { loan, form, error, status } = await loadLoanAndBorrower(r.loan_id);
    if (error) return res.status(status).json({ error });
    const borrowers = [toEmsBorrower(form)];
    if (r.request_type === 'Joint' && form.first_nm_borrower_2) borrowers.push(toEmsBorrower(form, true));

    const result = await ems.retrieveCredit({
      reportId: r.ems_report_id, loanNumber: loan.loan_number,
      requestedBy: req.body?.requestedBy, borrowers, mode: r.pull_mode,
    });
    if (result.ok) {
      await db.query('UPDATE credit_reports SET ? WHERE id=?', [{
        scores_json: JSON.stringify(result.scores), liabilities_json: JSON.stringify(result.liabilities),
        inquiries_json: JSON.stringify(result.inquiries), public_records_json: JSON.stringify(result.publicRecords),
        report_pdf: result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64') : r.report_pdf,
        raw_response_xml: result.raw,
      }, r.id]);
    }
    await audit({ loanId: r.loan_id, creditReportId: r.id, action: 'Retrieve', mode: r.pull_mode,
      outcome: result.ok ? 'success' : 'ems_error', requestedBy: req.body?.requestedBy,
      detail: result.ok ? `Retrieved ${r.ems_report_id}` : result.errors.join(' | ') });
    res.status(result.ok ? 200 : 422).json({ ok: result.ok, status: result.status, errors: result.errors });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

module.exports = router;
