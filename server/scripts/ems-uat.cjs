#!/usr/bin/env node
'use strict';
/**
 * server/scripts/ems-uat.cjs — exercise the Equifax Mortgage Solutions (EMS)
 * credit integration against UAT and write the evidence to send Equifax.
 *
 *   cd ~/jammie-crm && node server/scripts/ems-uat.cjs --loan 55            # individual report for seat 1
 *   node server/scripts/ems-uat.cjs --loan 55 --joint                        # + a joint report (seats 1 and 2)
 *   node server/scripts/ems-uat.cjs --loan 55 --errors                       # + the no-cost error cases (E037, E063)
 *   node server/scripts/ems-uat.cjs --loan 55 --only 3,5                     # a subset
 *   node server/scripts/ems-uat.cjs --list                                   # just print the scenarios
 *   node server/scripts/ems-uat.cjs --reparse 1                              # re-parse a stored report (credit_reports.id) with the current parser
 *
 * Reads .env (EMS_* settings) and the loan's borrower seats from the
 * database, exactly as the CRM does. Every request/response pair (password
 * and SSNs redacted) and the PDF are written to
 *   ~/ems-uat-evidence/<timestamp>/   (NN-name.request.xml, NN-name.response.xml, NN-name.pdf)
 * plus EVIDENCE.md and summary.json. Nothing here writes to credit_reports —
 * use the CRM panel for that; this is the command-line proof.
 *
 * Every Submit is a credit inquiry on the file of the SSN on the loan. Use
 * Equifax's UAT test borrowers, never a real person.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const fs  = require('fs');
const os  = require('os');
const ems = require('../lib/ems.cjs');
const { helpers } = require('../routes/credit.cjs');

const args = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i === -1 ? dflt : (args[i + 1] ?? true); };
const flag = name => args.includes(name);
const only = opt('--only') ? String(opt('--only')).split(',').map(s => Number(s.trim())) : null;
const loanId = opt('--loan');
const requestedBy = opt('--requested-by', process.env.EMS_UAT_REQUESTED_BY || 'Jammie UAT');

const url = process.env.EMS_URL || ems.EMS_UAT_URL;
const env = /uat|test|localhost|127\.0\.0\.1/i.test(url) ? 'UAT' : 'PRODUCTION';

async function post(xml) {
  const t0 = Date.now();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', Accept: 'text/xml' }, body: xml, signal: AbortSignal.timeout(90_000) });
  const body = await res.text();
  return { httpStatus: res.status, body, durationMs: Date.now() - t0 };
}

function describe(p) {
  if (!p.ok) return `${p.status.code || '—'}: ${p.status.description || p.errors.join(' | ')}`;
  const q = ems.qualifyingScores(p.scores).map(x => `${x.borrowerId} ${x.qualifying} (${x.basis})`).join(', ');
  return `order ${p.reportId} · scores ${q || 'none'} · ${p.liabilities.length} tradelines · ${p.inquiries.length} inquiries · ${p.publicRecords.length} public records · PDF ${p.pdfBase64 ? 'yes' : 'no'}`;
}

(async () => {
  if (opt('--reparse')) {
    // Reports stored before this parser version (e.g. the first UAT pull) get the new fields.
    const db = require('../db.cjs');
    const id = Number(opt('--reparse'));
    const [[row]] = await db.query('SELECT id, raw_response_xml FROM credit_reports WHERE id=?', [id]);
    if (!row) { console.error(`credit_reports.id ${id} not found`); process.exit(1); }
    const p = ems.parseResponse(row.raw_response_xml || '');
    await db.query('UPDATE credit_reports SET ? WHERE id=?', [{ ems_report_id: p.reportId, status_code: p.status.code, status_condition: p.status.condition, status_description: (p.status.description || '').slice(0, 255),
      scores_json: p.ok ? JSON.stringify(p.scores) : null, liabilities_json: p.ok ? JSON.stringify(p.liabilities) : null, inquiries_json: p.ok ? JSON.stringify(p.inquiries) : null, public_records_json: p.ok ? JSON.stringify(p.publicRecords) : null,
      ...(p.pdfBase64 ? { report_pdf: Buffer.from(p.pdfBase64, 'base64') } : {}) }, id]);
    console.log(`credit_reports.id ${id}: ${describe(p)}`);
    process.exit(0);
  }
  const cfgOk = !!(process.env.EMS_ACCOUNT && process.env.EMS_PASSWORD);
  console.log(`EMS ${env}  ${url}\naccount ${process.env.EMS_ACCOUNT || '(EMS_ACCOUNT not set)'}  submitting party ${process.env.EMS_SUBMITTING_PARTY || 'Jammie Mortgage'}\n`);

  let loan = null, seats = [];
  if (loanId) {
    loan = await helpers.loadLoan(loanId);
    if (!loan) { console.error(`Loan ${loanId} not found`); process.exit(1); }
    seats = await helpers.loadSeats(loan.id);
    for (const s of seats) {
      const sum = helpers.seatSummary(s);
      console.log(`seat ${s.slot} ${sum.label}: ${sum.name} · SSN •••-••-${sum.ssnLast4 || '????'} · ${sum.address || 'no address'} · ${sum.ready ? 'ready' : 'NOT READY: ' + sum.problems.join('; ')} · ${sum.authorizedAt ? 'authorized ' + String(sum.authorizedAt).slice(0, 10) : 'not authorized (the runner does not check this; the CRM does)'}`);
    }
    console.log('');
  }
  const b1 = seats[0] ? helpers.toEmsBorrower(seats[0].row) : null;
  const b2 = seats[1] ? helpers.toEmsBorrower(seats[1].row) : null;
  const loanNumber = loan?.loan_number;
  const state = { orderId: null, borrowersUsed: null };

  const SCENARIOS = [
    { n: 1, name: 'config', title: 'Credentials and endpoint configured', expect: 'EMS_ACCOUNT / EMS_PASSWORD present; UAT endpoint', local: true,
      run: async () => ({ ok: cfgOk, text: cfgOk ? `account ${process.env.EMS_ACCOUNT} · ${url}` : 'EMS_ACCOUNT / EMS_PASSWORD missing in .env' }) },
    { n: 2, name: 'preview', title: 'Build the Submit request for seat 1 (no EMS call)', expect: 'Valid MISMO 2.3.1 document; no validation problems', local: true, needsLoan: true,
      run: async () => { const { xml } = ems.buildSubmitRequest({ loanNumber, requestedBy, borrowers: [b1] }); return { ok: true, text: `${xml.length} bytes`, requestXml: xml }; } },
    { n: 3, name: 'individual', title: 'Submit — Individual report for seat 1', expect: 'CreditReportIdentifier + CREDIT_SCORE per bureau + CREDIT_LIABILITY + EMBEDDED_FILE PDF', needsLoan: true,
      run: async () => { const { xml } = ems.buildSubmitRequest({ loanNumber, requestedBy, borrowers: [b1] }); const r = await post(xml); const p = ems.parseResponse(r.body); if (p.ok) { state.orderId = p.reportId; state.borrowersUsed = [b1]; } return { ...r, parsed: p, requestXml: xml }; } },
    { n: 4, name: 'joint', title: 'Submit — Joint report for seats 1 and 2', expect: 'Scores for B1 and B2; joint accounts listed under each', needsLoan: true, optional: !flag('--joint'),
      run: async () => { if (!b2) throw new Error('This loan has no co-borrower (seat 2)'); const { xml } = ems.buildSubmitRequest({ loanNumber, requestedBy, borrowers: [b1, b2] }); const r = await post(xml); const p = ems.parseResponse(r.body); if (p.ok && !state.orderId) { state.orderId = p.reportId; state.borrowersUsed = [b1, b2]; } return { ...r, parsed: p, requestXml: xml }; } },
    { n: 5, name: 'retrieve', title: 'Retrieve — reprint the first successful order by CreditReportIdentifier', expect: 'Same order number, report returned again, no new inquiry', needsLoan: true,
      run: async () => { if (!state.orderId) throw new Error('No successful order to retrieve (scenario 3/4)'); const { xml } = ems.buildRetrieveRequest({ reportId: state.orderId, loanNumber, requestedBy, borrowers: state.borrowersUsed }); const r = await post(xml); return { ...r, parsed: ems.parseResponse(r.body), requestXml: xml }; } },
    { n: 6, name: 'bad-password', title: 'Error — wrong account password', expect: 'E037 Invalid Password (no inquiry made)', expectCode: 'E037', needsLoan: true, optional: !flag('--errors'),
      run: async () => { const { xml } = ems.buildSubmitRequest({ loanNumber, requestedBy, borrowers: [b1] }); const bad = xml.replace(/LoginAccountPassword="[^"]*"/, 'LoginAccountPassword="wrong-password"'); const r = await post(bad); return { ...r, parsed: ems.parseResponse(r.body), requestXml: bad }; } },
    { n: 7, name: 'missing-loan-number', title: 'Error — missing LenderCaseIdentifier', expect: 'E063 Invalid or missing loan number (no inquiry made)', expectCode: 'E063', needsLoan: true, optional: !flag('--errors'),
      run: async () => { const { xml } = ems.buildSubmitRequest({ loanNumber, requestedBy, borrowers: [b1] }); const bad = xml.replace(/ LenderCaseIdentifier="[^"]*"/, ''); const r = await post(bad); return { ...r, parsed: ems.parseResponse(r.body), requestXml: bad }; } },
  ];

  if (flag('--list')) { for (const s of SCENARIOS) console.log(`${String(s.n).padStart(2)}  ${s.name.padEnd(20)} ${s.title}${s.optional ? '  (optional)' : ''}`); process.exit(0); }
  if (!loanId) { console.error('Pass --loan <loans.id> (a loan whose borrower is one of Equifax\'s UAT test identities). --list prints the scenarios.'); process.exit(1); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(os.homedir(), 'ems-uat-evidence', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  const md = [`# Equifax Mortgage Solutions — UAT evidence`, ``, `- Date: ${new Date().toISOString()}`, `- Environment: ${env} (${url})`, `- Account: ${process.env.EMS_ACCOUNT || '—'}`, `- Submitting party: ${process.env.EMS_SUBMITTING_PARTY || 'Jammie Mortgage'}`, `- Loan: ${loanNumber} (id ${loan.id}) · seats ${seats.map(s => s.slot).join(', ')}`, ``, `| # | Scenario | Expected | HTTP | Status | Result | ms | Files |`, `|---|---|---|---|---|---|---|---|`];

  for (const s of SCENARIOS) {
    if (only && !only.includes(s.n)) continue;
    if (s.optional && !only) { console.log(`${String(s.n).padStart(2)}. ${s.title} — skipped (optional; pass ${s.n === 4 ? '--joint' : '--errors'} or --only ${s.n})`); continue; }
    if (s.needsLoan && !b1) { console.log(`${String(s.n).padStart(2)}. ${s.title} — skipped (loan has no borrower)`); continue; }
    process.stdout.write(`${String(s.n).padStart(2)}. ${s.title} … `);
    const base = `${String(s.n).padStart(2, '0')}-${s.name}`;
    try {
      const r = await s.run();
      const files = [];
      if (r.requestXml) { fs.writeFileSync(path.join(dir, `${base}.request.xml`), ems.redact(r.requestXml)); files.push(`${base}.request.xml`); }
      if (r.body) { fs.writeFileSync(path.join(dir, `${base}.response.xml`), ems.redact(r.body)); files.push(`${base}.response.xml`); }
      if (r.parsed?.pdfBase64) { fs.writeFileSync(path.join(dir, `${base}.pdf`), Buffer.from(r.parsed.pdfBase64, 'base64')); files.push(`${base}.pdf`); }
      const ok = s.local ? r.ok : (s.expectCode ? String(r.parsed.status?.code || '').toUpperCase() === s.expectCode : r.parsed.ok);
      const text = s.local ? r.text : describe(r.parsed);
      console.log(`${ok ? '✓' : '✗'} ${text}${r.durationMs ? ` (${r.durationMs} ms)` : ''}`);
      rows.push({ n: s.n, name: s.name, ok, httpStatus: r.httpStatus ?? null, status: r.parsed?.status ?? null, text, durationMs: r.durationMs ?? null, files });
      md.push(`| ${s.n} | ${s.title} | ${s.expect} | ${r.httpStatus ?? '—'} | ${r.parsed?.status?.code ?? (ok ? 'OK' : '—')} | ${text.replace(/\|/g, '/')} | ${r.durationMs ?? '—'} | ${files.join(', ')} |`);
    } catch (e) {
      console.log(`✗ ${e.message}`);
      rows.push({ n: s.n, name: s.name, ok: false, error: e.message });
      md.push(`| ${s.n} | ${s.title} | ${s.expect} | — | — | ${e.message.replace(/\|/g, '/')} | — | |`);
    }
  }
  md.push('', 'Request files have the password and SSNs redacted. Scores and tradelines are in the response XML; the PDF is the report EMS embedded in EMBEDDED_FILE.');
  fs.writeFileSync(path.join(dir, 'EVIDENCE.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ date: new Date().toISOString(), env, url, loan: loanNumber, rows }, null, 2));
  console.log(`\nEvidence written to ${dir}\n  ${fs.readdirSync(dir).join('\n  ')}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
