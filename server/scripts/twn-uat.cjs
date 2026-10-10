#!/usr/bin/env node
'use strict';
/**
 * server/scripts/twn-uat.cjs — run Equifax's TWN integration test plan
 * against UAT and write the evidence Equifax asks for.
 *
 *   cd ~/jammie-crm && node server/scripts/twn-uat.cjs                 # all scenarios
 *   node server/scripts/twn-uat.cjs --only 2,4,10                        # a subset
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
const SCENARIOS = [
  { n: 1,  name: 'template-list', title: 'Template list (which TEMPLATE_NAMEs this account may use)', run: () => twn.listTemplates({ loanNumber }) },
  { n: 2,  name: 'multiple-employers', title: 'Multiple employer records — SSN 799005145 (4 records)', select: { ssn: '799005145' } },
  { n: 3,  name: 'multiple-identity', title: 'Multiple identity — SSN 999006004 (expect 17221 without employer name)', select: { ssn: '999006004' },
           then: multiEmployer ? { name: 'multiple-identity-with-employer', title: `Multiple identity with EMPLOYERNAME "${multiEmployer}"`, select: { ssn: '999006004', employerName: multiEmployer } } : null },
  { n: 4,  name: 'employee-not-found', title: 'Employee not found — SSN 999778123 (expect 17004)', select: { ssn: '999778123' } },
  { n: 5,  name: 'salary-key', title: 'Salary key — SSN 999004102' + (salaryKey ? ' with key' : ' without key (expect 17008/17009/17010)'), select: { ssn: '999004102', salaryKey: salaryKey || '' } },
  { n: 6,  name: 'rhode-island', title: 'Rhode Island resident — SSN 799005141 with FIRSTNAME/LASTNAME', select: { ssn: '799005141', firstName: 'Test', lastName: 'RhodeIslandEmpl' } },
  { n: 7,  name: 'alternate-id', title: 'Alternate ID 9999990424 with employer code 10396', select: { employeeId: '9999990424', employerCode: '10396' } },
  { n: 8,  name: 'fcra', title: 'FCRA action on record — SSN 799005001 (expect FCRAINFO)', select: { ssn: '799005001' } },
  { n: 9,  name: 'max-values', title: 'Maximum field lengths — SSN 666458964', select: { ssn: '666458964' } },
  { n: 10, name: 'search-match-1', title: 'Alternate information search — Patricia Eerat (no SSN)', select: { firstName: 'Patricia', lastName: 'Eerat', addr1: '9226 NTRQVBZT DR', city: 'DURHAM', state: 'NC', postalCode: '27712', dob: '1993-02-28' } },
  { n: 11, name: 'search-match-2', title: 'Alternate information search — Barbara FFHKSVC (no SSN)', select: { firstName: 'Barbara', lastName: 'FFHKSVC', addr1: '63N RCE ISXXSA RD', city: 'Monroe TWP', state: 'NJ', postalCode: '08831', dob: '1934-01-19' } },
  { n: 12, name: 'filter-active', title: 'Employee status filter A (active only) — SSN 799005145', select: { ssn: '799005145', filter: 'A' } },
  { n: 13, name: 'filter-inactive', title: 'Employee status filter I (inactive only) — SSN 799005145', select: { ssn: '799005145', filter: 'I' } },
  { n: 14, name: 'pdf', title: 'GENERATE_PDF — SSN 799005132 (multipart response with embedded PDF)', select: { ssn: '799005132', pdf: true } },
  { n: 15, name: 'reverify', title: 'Re-verify the first employer record from scenario 2 (SRVRTID)', dependsOn: 2, run: (ctx) => twn.reverify({ loanNumber, ssn: '799005145', srvrtid: ctx.srvrtid }) },
  { n: 16, name: 'audit', title: 'Audit by reference number (same full response again)', dependsOn: 2, run: (ctx) => twn.audit({ loanNumber, ssn: '799005145', srvrtid: ctx.srvrtid }) },
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
  const md = [`# The Work Number — UAT evidence`, ``, `- Date: ${new Date().toISOString()}`, `- Environment: ${cfg.env} (${cfg.url})`, `- Verifier: ${cfg.username}`, `- APPID/APPVER: ${cfg.appId}/${cfg.appVer}`, `- EMPLOYEESTATUSFILTER: ${cfg.filter} · TEMPLATE_NAME: ${cfg.template}`, `- TRNUID (loan number) used: ${loanNumber}`, ``, `| # | Scenario | HTTP | Sign-on | Status | Message | Employers | PDF | ms | Files |`, `|---|---|---|---|---|---|---|---|---|---|`];

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
      md.push(`| ${s.n} | ${s.title} | ${err.httpStatus || '—'} | — | **${err.code || 'ERROR'}** | ${err.message.replace(/\|/g, '/')} | — | — | ${err.durationMs || '—'} | ${reqXml ? base + '.request.xml' : ''} |`);
      return;
    }
    fs.writeFileSync(path.join(dir, `${base}.request.xml`), r.requestXml);
    fs.writeFileSync(path.join(dir, `${base}.response.xml`), r.responseXml);
    if (r.pdf) fs.writeFileSync(path.join(dir, `${base}.pdf`), r.pdf.bytes);
    const p = r.parsed;
    const emps = p.employments.map(e => `${e.employer.name || e.employer.code} (${e.status.message || e.status.code}${e.monthlyBaseEstimate ? `, ~$${e.monthlyBaseEstimate.toLocaleString('en-US')}/mo` : ''})`).join('; ');
    const extra = p.templates.length ? `templates: ${p.templates.map(t => t.name).join(', ')}` : '';
    console.log(`${p.ok ? '✓' : '•'} status ${p.status.code || '—'} ${p.status.message || ''} ${emps || extra} ${r.pdf ? '[PDF ' + r.pdf.bytes.length + ' B]' : ''} ${r.durationMs} ms`);
    if (s.n === 2 && p.employments[0]?.srvrtid) ctx.srvrtid = p.employments[0].srvrtid;
    rows.push({ n: s.n, name: base, ok: p.ok, httpStatus: r.httpStatus, signon: p.signon.code, status: p.status, employers: p.employments.length, templates: p.templates, pdf: !!r.pdf, durationMs: r.durationMs, fcra: p.employments.some(e => e.fcraBlocked) });
    md.push(`| ${s.n} | ${s.title} | ${r.httpStatus} | ${p.signon.code} | **${p.status.code}** | ${(p.status.message || p.status.friendly || '').replace(/\|/g, '/')} | ${p.employments.length}${extra ? ' · ' + extra : ''} | ${r.pdf ? 'yes' : '—'} | ${r.durationMs} | ${base}.request.xml / .response.xml${r.pdf ? ' / .pdf' : ''} |`);
  };

  for (const s of SCENARIOS) {
    if (only && !only.includes(s.n)) continue;
    if (s.dependsOn && !ctx.srvrtid) { console.log(`${String(s.n).padStart(2, '0')}-${s.name}: skipped (needs scenario ${s.dependsOn} to return an SRVRTID)`); md.push(`| ${s.n} | ${s.title} | — | — | skipped | needs scenario ${s.dependsOn} | — | — | — | |`); continue; }
    await runOne(s);
    if (s.then) await runOne({ ...s.then, n: s.n }, s.then.name);
  }

  fs.writeFileSync(path.join(dir, 'EVIDENCE.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ config: cfg, loanNumber, rows }, null, 2));
  console.log(`\nEvidence written to ${dir}\n  EVIDENCE.md, summary.json, and one request/response pair per scenario.`);
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
