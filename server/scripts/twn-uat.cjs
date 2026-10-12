#!/usr/bin/env node
'use strict';
/**
 * server/scripts/twn-uat.cjs — run Equifax's TWN integration test plan
 * against UAT and write the evidence Equifax asks for.
 *
 *   cd ~/jammie-crm && node server/scripts/twn-uat.cjs                 # all scenarios
 *   node server/scripts/twn-uat.cjs --only 2,4,10                        # a subset
 *   node server/scripts/twn-uat.cjs --templates                          # include the template-list call
 *   node server/scripts/twn-uat.cjs --salary-key 123456                  # when Equifax gives you one
 *   node server/scripts/twn-uat.cjs --multi-employer "Employer Name"     # scenario 3 second call
 *   node server/scripts/twn-uat.cjs --list                               # just print the scenarios
 *
 * Reads .env (TWN_* settings). Nothing here touches the database; every
 * request/response pair and any PDF is written to
 *   ~/twn-uat-evidence/<timestamp>/   (NN-name.request.xml, NN-name.response.xml, NN-name.pdf)
 * plus EVIDENCE.md (one row per scenario) and summary.json. Passwords are
 * redacted in the saved requests. SSNs in this file are Equifax's published
 * test cases, not real people.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const fs  = require('fs');
const os  = require('os');
const twn = require('../lib/twn.cjs');

const args = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i === -1 ? dflt : (args[i + 1] ?? true); };
const only = opt('--only') ? String(opt('--only')).split(',').map(s => Number(s.trim())) : null;
const salaryKey = opt('--salary-key');
const multiEmployer = opt('--multi-employer');
const loanNumber = opt('--loan', 'UAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''));
const endUser = opt('--end-user', process.env.TWN_UAT_ENDUSER || 'uat@jammie-mlo.com');

// Equifax's test plan (EVS - TWN Integration Test Plan) + test-case list.
// `expect` is what the plan says a correct integration receives.
const SM = { firstName: 'Patricia', lastName: 'Eerat', addr1: '9226 NTRQVBZT DR', city: 'DURHAM', state: 'NC' };
const SCENARIOS = [
  { n: 1,  name: 'template-list', title: 'Template list (TSVGETTEMPLATELISTTRNRQ)', expect: 'List of allowed TEMPLATE_NAMEs (Equifax UAT answered HTTP 500 on 2026-10-10; optional)', optional: true, run: () => twn.listTemplates({ loanNumber }) },
  { n: 2,  name: 'multiple-employers', title: 'Multiple employer records — SSN 799005144 (3 records)', expect: 'Status 0 with several TSVRESPONSE_V100 records', select: { ssn: '799005144' } },
  { n: 3,  name: 'multiple-identity', title: 'Multiple identity — SSN 999006004 without employer name', expect: '17221 (employer name required)', select: { ssn: '999006004' },
           then: multiEmployer ? { name: 'multiple-identity-with-employer', title: `Multiple identity with EMPLOYERNAME "${multiEmployer}"`, expect: 'Status 0 for that employer', select: { ssn: '999006004', employerName: multiEmployer } } : null },
  { n: 4,  name: 'employee-not-found', title: 'Employee not found — SSN 999778123', expect: '17004', select: { ssn: '999778123' } },
  { n: 5,  name: 'salary-key', title: 'Salary key — SSN 999004102' + (salaryKey ? ' with key' : ' without key'), expect: salaryKey ? 'Status 0' : '17008 / 17009 / 17010 (salary key required)', select: { ssn: '999004102', salaryKey: salaryKey || '' } },
  { n: 6,  name: 'rhode-island', title: 'Rhode Island resident — SSN 799005141 with FIRSTNAME/LASTNAME', expect: 'Status 0 (name supplied)', select: { ssn: '799005141', firstName: 'Test', lastName: 'RhodeIslandEmpl' } },
  { n: 7,  name: 'alternate-id', title: 'Alternate ID 9999990424 with EMPLOYERCODE 10396', expect: 'Status 0 (alt-ID employer must be enabled for the verifier)', select: { employeeId: '9999990424', employerCode: '10396' } },
  { n: 8,  name: 'fcra', title: 'FCRA action on record — SSN 799005001', expect: 'Status 0 with FCRAINFO aggregate', select: { ssn: '799005001' } },
  { n: 9,  name: 'max-values', title: 'Maximum field lengths — SSN 666458964', expect: 'Status 0; longest employer/employee values parse', select: { ssn: '666458964' } },
  { n: 10, name: 'search-match-1', title: 'Alternate information search — Patricia Eerat (name + street + city/state, as in Equifax sample)', expect: 'Status 0 (Search Match must be enabled for the verifier)', select: SM },
  { n: 11, name: 'search-match-2', title: 'Alternate information search — Patricia Eerat with ZIP and DOB', expect: 'Status 0', select: { ...SM, postalCode: '27712', dob: '1993-02-28' } },
  { n: 12, name: 'search-match-3', title: 'Alternate information search — Barbara FFHKSVC', expect: 'Status 0', select: { firstName: 'Barbara', lastName: 'FFHKSVC', addr1: '63N RCE ISXXSA RD', city: 'Monroe TWP', state: 'NJ', postalCode: '08831', dob: '1934-01-19' } },
  { n: 13, name: 'filter-active', title: 'EMPLOYEESTATUSFILTER A (active only) — SSN 799005144', expect: 'Status 0, active records only', select: { ssn: '799005144', filter: 'A' } },
  { n: 14, name: 'filter-inactive', title: 'EMPLOYEESTATUSFILTER I (inactive only) — SSN 799005144', expect: 'Status 0, inactive records only', select: { ssn: '799005144', filter: 'I' } },
  { n: 15, name: 'pdf', title: 'GENERATE_PDF — SSN 799005132 (multipart response, embedded PDF)', expect: 'Status 0 + application/pdf part', select: { ssn: '799005132', pdf: true } },
  { n: 16, name: 'frozen', title: 'Consumer data freeze — SSN 799005145', expect: '17234 (freeze on file; UI must explain)', select: { ssn: '799005145' } },
  { n: 17, name: 'reverify', title: 'Re-verify one employer record (SRVRTID from an earlier success)', expect: 'Status 0, same employer', dependsOn: true, run: (ctx) => twn.reverify({ loanNumber, ssn: ctx.ssn, srvrtid: ctx.srvrtid }) },
  { n: 18, name: 'audit', title: 'Audit by reference number (same full response again)', expect: 'Status 0, same response', dependsOn: true, run: (ctx) => twn.audit({ loanNumber, ssn: ctx.ssn, srvrtid: ctx.srvrtid }) },
];

if (opt('--list')) { for (const s of SCENARIOS) console.log(`${String(s.n).padStart(2)}  ${s.title}`); process.exit(0); }

(async () => {
  const cfg = twn.publicConfig();
  console.log(`TWN ${cfg.env.toUpperCase()}  ${cfg.url}\nuser ${cfg.username}  appid ${cfg.appId}/${cfg.appVer}  filter ${cfg.filter}  template ${cfg.template || '(none — set TWN_TEMPLATE)'}\ncertificate ${cfg.certificate?.loads ? 'loads' : 'DOES NOT LOAD: ' + (cfg.certificate?.error || cfg.missing.join(', '))}\n`);
  if (!cfg.configured) { console.error('Not configured:', cfg.missing.join(', ')); process.exit(1); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(os.homedir(), 'twn-uat-evidence', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const rows = []; const ctx = {};
  const md = [`# The Work Number — UAT evidence`, ``, `- Date: ${new Date().toISOString()}`, `- Environment: ${cfg.env} (${cfg.url})`, `- Verifier: ${cfg.username}`, `- APPID/APPVER: ${cfg.appId}/${cfg.appVer}`, `- EMPLOYEESTATUSFILTER: ${cfg.filter} · TEMPLATE_NAME: ${cfg.template}`, `- TRNUID (loan number) used: ${loanNumber}`, `- Transport: TLS 1.2 with client certificate; Content-Type application/x-ofx (multipart/related when GENERATE_PDF)`, ``, `| # | Scenario | Expected | HTTP | Sign-on | Status | Message | Employers | PDF | ms | Files |`, `|---|---|---|---|---|---|---|---|---|---|---|`];

  const runOne = async (s, label) => {
    const base = `${String(s.n).padStart(2, '0')}-${label || s.name}`;
    process.stdout.write(`${base.padEnd(38)} `);
    let r, err;
    try {
      if (s.run) r = await s.run(ctx);
      else r = await twn.verify({ loanNumber, endUser, pdf: false, ...s.select });
    } catch (e) { err = e; }
    if (err) {
      const reqXml = err.code === 'TWN_VALIDATION' ? '' : (() => { try { return twn.redact(s.run ? '' : twn.buildSelectRequest({ loanNumber, endUser, ...s.select })); } catch { return ''; } })();
      if (reqXml) fs.writeFileSync(path.join(dir, `${base}.request.xml`), reqXml);
      if (err.raw) fs.writeFileSync(path.join(dir, `${base}.response.txt`), err.raw);
      console.log(`✗ ${err.code || 'ERROR'}: ${err.message}`);
      rows.push({ n: s.n, name: base, error: err.message, code: err.code, httpStatus: err.httpStatus || null });
      md.push(`| ${s.n} | ${s.title} | ${s.expect || ''} | ${err.httpStatus || '—'} | — | **${err.code || 'ERROR'}** | ${err.message.replace(/\|/g, '/')} | — | — | ${err.durationMs || '—'} | ${reqXml ? base + '.request.xml' : ''}${err.raw ? ' / .response.txt' : ''} |`);
      return;
    }
    fs.writeFileSync(path.join(dir, `${base}.request.xml`), r.requestXml);
    fs.writeFileSync(path.join(dir, `${base}.response.xml`), r.responseXml);
    if (r.pdf) fs.writeFileSync(path.join(dir, `${base}.pdf`), r.pdf.bytes);
    const p = r.parsed;
    const emps = p.employments.map(e => `${e.employer.name || e.employer.code} (${e.status.message || e.status.code}${e.monthlyBaseEstimate ? `, ~$${e.monthlyBaseEstimate.toLocaleString('en-US')}/mo` : ''})`).join('; ');
    const extra = p.templates.length ? `templates: ${p.templates.map(t => t.name).join(', ')}` : '';
    console.log(`${p.ok ? '✓' : '•'} status ${p.status.code || '—'} ${p.status.message || ''} ${emps || extra} ${r.pdf ? '[PDF ' + r.pdf.bytes.length + ' B]' : ''} ${r.durationMs} ms`);
    // the first successful SSN-based verification feeds re-verify / audit
    if (!ctx.srvrtid && p.ok && p.employments[0]?.srvrtid && s.select?.ssn) { ctx.srvrtid = p.employments[0].srvrtid; ctx.ssn = s.select.ssn; }
    rows.push({ n: s.n, name: base, ok: p.ok, httpStatus: r.httpStatus, signon: p.signon.code, status: p.status, employers: p.employments.length, templates: p.templates, pdf: !!r.pdf, durationMs: r.durationMs, fcra: p.employments.some(e => e.fcraBlocked) });
    const fcra = p.employments.some(e => e.fcraBlocked) ? ' · FCRAINFO present' : '';
    md.push(`| ${s.n} | ${s.title} | ${s.expect || ''} | ${r.httpStatus} | ${p.signon.code} | **${p.status.code}** | ${(p.status.message || p.status.friendly || '').replace(/\|/g, '/')} | ${p.employments.length}${fcra}${extra ? ' · ' + extra : ''} | ${r.pdf ? 'yes (' + r.pdf.bytes.length + ' B)' : '—'} | ${r.durationMs} | ${base}.request.xml / .response.xml${r.pdf ? ' / .pdf' : ''} |`);
  };

  for (const s of SCENARIOS) {
    if (only ? !only.includes(s.n) : s.optional && !opt('--templates')) continue;
    if (s.dependsOn && !ctx.srvrtid) { console.log(`${String(s.n).padStart(2, '0')}-${s.name}: skipped (no successful SSN verification earlier in this run to reference)`); md.push(`| ${s.n} | ${s.title} | ${s.expect || ''} | — | — | skipped | needs an SRVRTID from an earlier success | — | — | — | |`); continue; }
    await runOne(s);
    if (s.then) await runOne({ ...s.then, n: s.n }, s.then.name);
  }
  md.push('', '## Notes', '- Scenario 1 (template list) is optional: run with `--templates`.', '- 17234 = consumer freeze on the test record; the integration surfaces the freeze message to the loan officer.', '- Search Match (10–12) and alternate-ID employers (7) must be enabled for the verifier account by Equifax; a 400/17004 there with a well-formed request indicates the account setup, not the request.');

  fs.writeFileSync(path.join(dir, 'EVIDENCE.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ config: cfg, loanNumber, rows }, null, 2));
  console.log(`\nEvidence written to ${dir}\n  EVIDENCE.md, summary.json, and one request/response pair per scenario.`);
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
