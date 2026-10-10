'use strict';
/**
 * server/lib/twn.cjs — The Work Number® (Equifax Verification Services)
 * employment & income verification: build OFX requests, send them over
 * mutual TLS, parse what comes back.
 *
 * PROTOCOL (Integration Guide 04/2022, TWN Select Supplement 05/2026)
 *   • XML in the OFX 2.01 dialect, POSTed to …/verifications/v1/ with
 *     `Content-Type: application/x-ofx` and `MIME-Version: 1.0`.
 *   • Two credentials at once: the client certificate (PFX) during the TLS
 *     handshake, and USERID/USERPASS inside <SONRQ>. The username gets
 *     "@50005" appended (all integrated users, UAT and prod).
 *   • TRNUID must be the loan number for mortgage clients.
 *   • A PDF of the verification is requested with <GENERATE_PDF/>; the
 *     request must then be sent as multipart/related, and the response is
 *     multipart too: an application/x-ofx part plus a base64 application/pdf.
 *   • Errors are data: the HTTP status is 200 and the OFX <STATUS><CODE> says
 *     what happened (17004 not found, 17221 multiple identities, …). The
 *     parser never throws on those; the caller shows them.
 *   • TLS 1.2 only, ECDHE-RSA-AES-GCM ciphers.
 *
 * ENV (.env on the VM)
 *   TWN_ENV            uat | prod                      (default uat)
 *   TWN_URL            override the endpoint          (optional)
 *   TWN_USERNAME       e.g. PeoplesMortgageTEST       (no @50005 — added here)
 *   TWN_PASSWORD
 *   TWN_PFX_PATH       /home/<user>/secrets/twn-uat.pfx
 *   TWN_PFX_PASSWORD
 *   TWN_APPID          default JammieCRM
 *   TWN_APPVER         default 1
 *   TWN_PLATFORM       default "Jammie CRM"            (sent as PLATFORM)
 *   TWN_INTERMEDIARY   blank for a direct verifier
 *   TWN_RESELLER_CUSTOMER  only for reseller/broker contracts (RESELLER_INFO/CUSTOMER)
 *   TWN_PURPOSE        default PPCREDIT
 *   TWN_FILTER         default U  (Mortgage Ultimate: active 90 days + inactive 24 months)
 *   TWN_TEMPLATE       TEMPLATE_NAME assigned by Equifax; discover with listTemplates()
 */

const fs     = require('fs');
const https  = require('https');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

const URLS = {
  uat:  'https://test.evs.equifax.com/verifications/v1/',
  prod: 'https://evs.equifax.com/verifications/v1/',
};

// ── config ──────────────────────────────────────────────────────────────
function config() {
  const env = (process.env.TWN_ENV || 'uat').toLowerCase() === 'prod' ? 'prod' : 'uat';
  const c = {
    env,
    url: process.env.TWN_URL || URLS[env],
    username: (process.env.TWN_USERNAME || '').trim(),
    password: process.env.TWN_PASSWORD || '',
    pfxPath: process.env.TWN_PFX_PATH || '',
    pfxPassword: process.env.TWN_PFX_PASSWORD || '',
    appId: process.env.TWN_APPID || 'JammieCRM',
    appVer: String(parseInt(process.env.TWN_APPVER || '1', 10) || 1),
    platform: process.env.TWN_PLATFORM || 'Jammie CRM',
    intermediary: process.env.TWN_INTERMEDIARY || '',
    resellerCustomer: process.env.TWN_RESELLER_CUSTOMER || '',
    purpose: process.env.TWN_PURPOSE || 'PPCREDIT',
    filter: process.env.TWN_FILTER || 'U',
    template: process.env.TWN_TEMPLATE || '',
  };
  const missing = [];
  if (!c.username) missing.push('TWN_USERNAME');
  if (!c.password) missing.push('TWN_PASSWORD');
  if (!c.pfxPath) missing.push('TWN_PFX_PATH');
  else if (!fs.existsSync(c.pfxPath)) missing.push(`TWN_PFX_PATH (file not found: ${c.pfxPath})`);
  if (!c.pfxPassword) missing.push('TWN_PFX_PASSWORD');
  c.missing = missing;
  c.configured = missing.length === 0;
  return c;
}

/** What the UI may see — never the secrets. */
function publicConfig() {
  const c = config();
  return { env: c.env, url: c.url, configured: c.configured, missing: c.missing, username: c.username ? `${c.username}@50005` : null,
    appId: c.appId, appVer: c.appVer, platform: c.platform, purpose: c.purpose, filter: c.filter, template: c.template || null,
    certificate: certInfo(c) };
}

function certInfo(c) {
  try {
    if (!c.pfxPath || !fs.existsSync(c.pfxPath)) return null;
    // Node has no public PFX parser; building a TLS context proves the file + password load.
    require('tls').createSecureContext({ pfx: fs.readFileSync(c.pfxPath), passphrase: c.pfxPassword });
    return { loads: true, path: c.pfxPath };
  } catch (e) { return { loads: false, error: e.message }; }
}

// ── XML helpers ─────────────────────────────────────────────────────────
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (name, v) => (v === undefined || v === null || v === '') ? '' : `<${name}>${esc(v)}</${name}>`;
const digits = v => String(v ?? '').replace(/\D/g, '');
const ymd = v => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}${m[2]}${m[3]}` : digits(v).slice(0, 8) || ''; };
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const OFX_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="201" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n';

function signon(c) {
  return `<SIGNONMSGSRQV1><SONRQ>${tag('DTCLIENT', stamp())}${tag('USERID', `${c.username}@50005`)}${tag('USERPASS', c.password)}${tag('LANGUAGE', 'ENG')}${tag('APPID', c.appId)}${tag('APPVER', c.appVer)}</SONRQ></SIGNONMSGSRQV1>`;
}

/**
 * Validate what we are about to send. Returns [] when fine.
 * Either an SSN/alternate ID, or the alternative-search set (first, last,
 * street, city+state or ZIP) must be present — otherwise TWN answers 17004.
 */
function validateSelect(o) {
  const p = [];
  if (!o.loanNumber) p.push('Loan number (TRNUID) is required');
  const id = digits(o.ssn || o.employeeId);
  const alt = o.firstName && o.lastName && o.addr1 && ((o.city && o.state) || o.postalCode);
  if (!id && !alt) p.push('An SSN (or alternate ID), or first + last name + street + city/state or ZIP, is required');
  if (id && o.ssn && id.length !== 9) p.push('SSN must be 9 digits');
  if (!o.template) p.push('TEMPLATE_NAME is required — set TWN_TEMPLATE in .env (use the template list to find the right name)');
  if (o.salaryKey && !/^\d{6}$/.test(String(o.salaryKey))) p.push('Salary key must be 6 digits');
  return p;
}

/**
 * Build a TWN Select (instant verification) request.
 * o = { loanNumber, ssn | employeeId, firstName, middleName, lastName, addr1, addr2, city, state, postalCode, dob,
 *       employerName, employerCode, salaryKey, filter, template, pdf, endUser, cltCookie, masterSrvrtid }
 */
function buildSelectRequest(o, c = config()) {
  const problems = validateSelect({ ...o, template: o.template || c.template, filter: o.filter || c.filter });
  if (problems.length) { const e = new Error(problems.join('; ')); e.code = 'TWN_VALIDATION'; e.problems = problems; throw e; }
  const rq = [
    tag('TRNUID', String(o.loanNumber).slice(0, 36)),
    tag('CLTCOOKIE', o.cltCookie),
    tag('PLATFORM', c.platform),
    tag('INTERMEDIARY', c.intermediary),
    tag('ENDUSER', o.endUser),
    o.masterSrvrtid ? tag('MASTERSRVRTID', o.masterSrvrtid) : '',
    `<TRNPURPOSE>${tag('CODE', o.purpose || c.purpose)}</TRNPURPOSE>`,
    c.resellerCustomer ? `<RESELLER_INFO>${tag('CUSTOMER', c.resellerCustomer)}</RESELLER_INFO>` : '',
    o.pdf ? '<GENERATE_PDF/>' : '',
    '<TSVTWNSELECTSMRQ>',
      tag('EMPLOYERNAME', o.employerName && String(o.employerName).slice(0, 60)),
      tag('EMPLOYERCODE', o.employerCode && digits(o.employerCode)),
      tag('TSVEMPLOYEEID', o.ssn ? digits(o.ssn) : (o.employeeId ? String(o.employeeId).slice(0, 11) : '')),
      tag('FIRSTNAME', o.firstName && String(o.firstName).slice(0, 20)),
      tag('MIDDLENAME', o.middleName && String(o.middleName).slice(0, 20)),
      tag('LASTNAME', o.lastName && String(o.lastName).slice(0, 50)),
      tag('ADDR1', o.addr1 && String(o.addr1).slice(0, 32)),
      tag('ADDR2', o.addr2 && String(o.addr2).slice(0, 32)),
      tag('CITY', o.city && String(o.city).slice(0, 32)),
      tag('STATE', o.state && stateCode(o.state)),
      tag('POSTALCODE', o.postalCode && String(o.postalCode).slice(0, 11)),
      tag('DTBIRTH', o.dob && ymd(o.dob)),
      tag('SALARYKEY', o.salaryKey && digits(o.salaryKey)),
      tag('EMPLOYEESTATUSFILTER', o.filter || c.filter),
      tag('TEMPLATE_NAME', o.template || c.template),
    '</TSVTWNSELECTSMRQ>',
  ].join('');
  return `${OFX_HEADER}<OFX>${signon(c)}<TSVERMSGSRQV1><TSVTWNSELECTTRNRQ>${rq}</TSVTWNSELECTTRNRQ></TSVERMSGSRQV1></OFX>`;
}

/** Template list: which TEMPLATE_NAME values this account may use. */
function buildTemplateListRequest(o = {}, c = config()) {
  const rq = `<TRNUID>${esc(o.loanNumber || 'TEMPLATES')}</TRNUID><TSVGETTEMPLATELISTRQ>${tag('TSVLENDER', o.lender)}${tag('TSVVERIFIER', o.verifier)}</TSVGETTEMPLATELISTRQ>`;
  return `${OFX_HEADER}<OFX>${signon(c)}<TSVERMSGSRQV1><TSVGETTEMPLATELISTTRNRQ>${rq}</TSVGETTEMPLATELISTTRNRQ></TSVERMSGSRQV1></OFX>`;
}

/** Re-verify one employer record from a previous response (SRVRTID). */
function buildReverifyRequest(o, c = config()) {
  const rq = `<TRNUID>${esc(String(o.loanNumber).slice(0, 36))}</TRNUID><TRNPURPOSE>${tag('CODE', o.purpose || c.purpose)}</TRNPURPOSE>` +
    `<EIVREVERIFICATIONRQ>${tag('EIVEMPLOYEEID', digits(o.ssn))}${tag('SRVRTID', o.srvrtid)}</EIVREVERIFICATIONRQ>`;
  return `${OFX_HEADER}<OFX>${signon(c)}<EIVVERMSGSRQV1><EIVREVERIFICATIONTRNRQ>${rq}</EIVREVERIFICATIONTRNRQ></EIVVERMSGSRQV1></OFX>`;
}

/** Audit: fetch the same full response again by reference number. */
function buildAuditRequest(o, c = config()) {
  const rq = `<TRNUID>${esc(String(o.loanNumber).slice(0, 36))}</TRNUID><EIVAUDITRQ>${tag('EIVEMPLOYEEID', digits(o.ssn))}${tag('SRVRTID', o.srvrtid)}</EIVAUDITRQ>`;
  return `${OFX_HEADER}<OFX>${signon(c)}<EIVVERMSGSRQV1><EIVAUDITTRNRQ>${rq}</EIVAUDITTRNRQ></EIVVERMSGSRQV1></OFX>`;
}

const redact = xml => String(xml).replace(/<USERPASS>[^<]*<\/USERPASS>/, '<USERPASS>***</USERPASS>');

const STATE_CODES = { Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY',DC:'DC','District of Columbia':'DC' };
function stateCode(v) { const s = String(v || '').trim(); if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase(); return STATE_CODES[s] || s.slice(0, 5); }

// ── transport ───────────────────────────────────────────────────────────
let agentCache = null;
function agent(c) {
  const key = `${c.pfxPath}:${fs.statSync(c.pfxPath).mtimeMs}`;
  if (agentCache && agentCache.key === key) return agentCache.agent;
  const a = new https.Agent({
    pfx: fs.readFileSync(c.pfxPath), passphrase: c.pfxPassword,
    minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
    ciphers: 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256',
    keepAlive: false,
  });
  agentCache = { key, agent: a };
  return a;
}

/**
 * POST one OFX document. With { multipart: true } (needed for GENERATE_PDF)
 * the body is wrapped as multipart/related and the response is split into
 * { ofx, attachments:[{name, contentType, bytes}] }.
 * Resolves to { httpStatus, ofx, attachments, raw, durationMs }. Rejects only
 * on transport failures (DNS, TLS, timeout, non-2xx).
 */
function post(xml, { multipart = false, timeoutMs = 90_000, c = config() } = {}) {
  return new Promise((resolve, reject) => {
    if (!c.configured) { const e = new Error(`TWN is not configured: ${c.missing.join(', ')}`); e.code = 'TWN_NOT_CONFIGURED'; return reject(e); }
    let body, contentType;
    const boundary = `--=${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    if (multipart) {
      body = Buffer.from(`--${boundary}\r\nContent-Type: application/x-ofx\r\n\r\n${xml}\r\n--${boundary}--\r\n`, 'utf8');
      contentType = `multipart/related; boundary="${boundary}"; type=application/x-ofx`;
    } else {
      body = Buffer.from(xml, 'utf8');
      contentType = 'application/x-ofx';
    }
    const u = new URL(c.url);
    const started = Date.now();
    const req = https.request({
      method: 'POST', host: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      agent: agent(c),
      headers: { 'MIME-Version': '1.0', 'Content-Type': contentType, 'Content-Length': body.length, 'Accept': 'application/x-ofx, multipart/related, */*', 'User-Agent': `${c.appId}/${c.appVer}` },
      timeout: timeoutMs,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const durationMs = Date.now() - started;
        const ct = String(res.headers['content-type'] || '');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const e = new Error(`TWN HTTP ${res.statusCode}${res.statusCode === 403 ? ' (client certificate rejected or missing)' : ''}: ${raw.toString('utf8').slice(0, 300)}`);
          e.code = 'TWN_HTTP'; e.httpStatus = res.statusCode; e.raw = raw.toString('utf8'); e.durationMs = durationMs;
          return reject(e);
        }
        if (/multipart\/related/i.test(ct)) {
          const parts = parseMultipart(raw, ct);
          const ofxPart = parts.find(p => /x-ofx/i.test(p.contentType)) || parts[0];
          resolve({ httpStatus: res.statusCode, ofx: ofxPart ? ofxPart.bytes.toString('utf8') : '', attachments: parts.filter(p => p !== ofxPart), raw: raw.toString('latin1'), durationMs });
        } else {
          resolve({ httpStatus: res.statusCode, ofx: raw.toString('utf8'), attachments: [], raw: raw.toString('utf8'), durationMs });
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`TWN request timed out after ${timeoutMs / 1000}s`)); });
    req.on('error', e => { e.code = e.code || 'TWN_TRANSPORT'; reject(e); });
    req.write(body); req.end();
  });
}

/** Split a multipart/related body into parts; decodes base64 attachments. */
function parseMultipart(raw, contentType) {
  const m = /boundary="?([^";]+)"?/i.exec(contentType);
  if (!m) return [{ contentType: 'application/x-ofx', bytes: raw }];
  const b = Buffer.from(`--${m[1]}`);
  const parts = [];
  let idx = raw.indexOf(b);
  while (idx !== -1) {
    const next = raw.indexOf(b, idx + b.length);
    if (next === -1) break;
    let seg = raw.subarray(idx + b.length, next);
    // strip leading CRLF, trailing CRLF
    if (seg[0] === 13 && seg[1] === 10) seg = seg.subarray(2);
    if (seg[seg.length - 2] === 13 && seg[seg.length - 1] === 10) seg = seg.subarray(0, seg.length - 2);
    const sep = seg.indexOf('\r\n\r\n');
    const headerText = sep === -1 ? '' : seg.subarray(0, sep).toString('latin1');
    let bytes = sep === -1 ? seg : seg.subarray(sep + 4);
    const h = {};
    for (const line of headerText.split(/\r\n/)) { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
    if (/base64/i.test(h['content-transfer-encoding'] || '')) bytes = Buffer.from(bytes.toString('latin1').replace(/\s+/g, ''), 'base64');
    parts.push({ contentType: h['content-type'] || '', name: h['content-location'] || h['content-id'] || '', encoding: h['content-transfer-encoding'] || 'binary', bytes });
    idx = next;
  }
  return parts;
}

// ── parsing ─────────────────────────────────────────────────────────────
const parser = new XMLParser({
  ignoreAttributes: true, parseTagValue: false, trimValues: true,
  isArray: (name) => ['TSVRESPONSE_V100', 'TSVANNUALCOMP', 'ITEMIZEDDISCLAIMERS', 'PAYPERIODSUMMARY_V100', 'TEMPLATE', 'FCRAINFODETAIL', 'INDICATORDETAILS'].includes(name),
});
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
const dateOf = v => { const d = digits(v); return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null; };
const codeMsg = o => (o && typeof o === 'object') ? { code: String(o.CODE ?? ''), message: String(o.MESSAGE ?? '') } : { code: '', message: '' };

const STATUS_TYPE = { 1:'A',2:'A',3:'A',4:'I',5:'A',6:'A',7:'I',8:'I',9:'A',10:'A',11:'A',12:'I',13:'A',14:'A',15:'I',16:'I',17:'A',18:'A',19:'A',20:'I',37:'I',38:'I',42:'A',43:'A',46:'I',52:'A',53:'A',54:'A',55:'I',56:'I',58:'A',61:'A',62:'I' };
const PAY_PERIODS_PER_YEAR = { '01':1, '02':2, '03':4, '04':12, '05':24, '06':26, '07':52, '08':260, '09':4 };
const PAY_FREQ_PER_YEAR = { 1:1, 2:2, 4:12, 5:24, 6:26, 7:52, 8:260, 10:13, 12:10, 14:11, 18:4, 19:12, 20:12, 24:9, 25:10, 27:12, 28:1, 29:1, 30:1, 31:1 };

/** Friendly text for the return codes the UI will meet most. */
const RETURN_CODES = {
  '0': 'Verification returned.',
  '400': 'Bad request — a required field is missing.',
  '2000': 'Equifax reported a general error. Try again; if it persists contact Equifax Verification Services.',
  '15500': 'Sign-on failed — check TWN_USERNAME / TWN_PASSWORD (username needs no @50005 in .env; it is added automatically).',
  '17000': 'This verifier account is disabled. Contact Equifax Verification Services.',
  '17001': 'Employer not found in The Work Number database.',
  '17003': 'This employer is blocked for instant verification. Request a researched verification.',
  '17004': 'Employee not found in The Work Number database. Check the SSN, or try name + address + date of birth.',
  '17005': 'The salary key is not valid.',
  '17006': 'The salary key has already been used — ask the borrower for a new one.',
  '17007': 'The salary key has expired — ask the borrower for a new one.',
  '17008': 'This employer requires a salary key from the borrower for income verification.',
  '17009': 'This employer requires a valid salary key from the borrower.',
  '17010': 'This employer requires a salary key from the borrower.',
  '17011': 'This account is not authorized for the requested product/template. Check TWN_FILTER / TWN_TEMPLATE against your contract.',
  '17012': 'Employer code or employer name is required for this request.',
  '17016': 'The loan number (TRNUID) was reused outside the allowed window.',
  '17065': 'This employer provides employment data only, not income.',
  '17221': 'More than one person may match this SSN — add the employer name and retry.',
  '17331': 'This state requires the borrower\'s name on the request.',
  '17332': 'The name on the request does not match the employment record.',
};

/** Monthly base estimate from rate + frequency, when it can be derived. */
function monthlyBase(base) {
  const rate = num(base.rateOfPay); if (rate == null) return null;
  const f = Number(base.payFrequency.code); const perYear = PAY_FREQ_PER_YEAR[f];
  if (f === 9 || f === 16 || f === 17 || f === 21) {                      // hourly
    const hrs = num(base.avgHoursPerPeriod); const ppy = PAY_PERIODS_PER_YEAR[String(base.payPeriod.code).padStart(2, '0')];
    if (hrs == null || !ppy) return null;
    return Math.round(rate * hrs * ppy / 12 * 100) / 100;
  }
  if (perYear) return Math.round(rate * perYear / 12 * 100) / 100;
  return null;
}

/**
 * Parse a TWN Select / Reverify / Audit / Template-list response.
 * Returns { ok, signon:{code,severity,message}, status:{code,severity,message,friendly}, trnuid,
 *           masterSrvrtid, price, productName, employments:[…], templates:[…], raw }
 */
function parseResponse(ofxText) {
  let doc;
  try { doc = parser.parse(ofxText); } catch (e) { return { ok: false, parseError: e.message, status: { code: 'PARSE', severity: 'ERROR', message: 'Response was not valid XML', friendly: 'Equifax returned something that is not an OFX document.' }, employments: [], templates: [] }; }
  const OFX = doc.OFX || {};
  const son = OFX.SIGNONMSGSRSV1?.SONRS?.STATUS || {};
  const signonStatus = { code: String(son.CODE ?? ''), severity: String(son.SEVERITY ?? ''), message: String(son.MESSAGE ?? '') };

  const trnrs = OFX.TSVERMSGSRSV1?.TSVTWNSELECTTRNRS || OFX.EIVVERMSGSRSV1?.EIVREVERIFICATIONTRNRS || OFX.EIVVERMSGSRSV1?.EIVAUDITTRNRS || OFX.TSVERMSGSRSV1?.TSVGETTEMPLATELISTTRNRS || {};
  const st = trnrs.STATUS || trnrs.TRNRSMACRO?.STATUS || {};
  const status = { code: String(st.CODE ?? (signonStatus.code && signonStatus.code !== '0' ? signonStatus.code : '')), severity: String(st.SEVERITY ?? ''), message: String(st.MESSAGE ?? '') };
  status.friendly = RETURN_CODES[status.code] || status.message || (status.code ? `Equifax returned code ${status.code}.` : 'No status returned.');
  if (signonStatus.code && signonStatus.code !== '0') status.friendly = RETURN_CODES[signonStatus.code] || `Sign-on failed (${signonStatus.code}): ${signonStatus.message}`;

  const price = trnrs.PRICERECEIPT ? { price: num(trnrs.PRICERECEIPT.PRICE), productName: trnrs.PRICERECEIPT.PRODUCTNAME || null, referenceNumber: trnrs.PRICERECEIPT.REFERENCENUMBER || null } : null;

  // template list
  const templates = arr(trnrs.TSVGETTEMPLATELISTRS?.TEMPLATES?.TEMPLATE).map(t => ({ name: t.TEMPLATE_NAME || '', version: t.TEMPLATE_VERSION || '', displayName: t.TEMPLATE_DISPLAY_NAME || '' }));

  // employment records
  const container = trnrs.TSVTWNSELECTRS || trnrs.EIVREVERIFICATIONRS || trnrs.EIVAUDITRS || {};
  const records = arr(container.TSVRESPONSE_V100);
  const employments = records.map(r => {
    const er = r.TSVEMPLOYER_V100 || {}, ee = r.TSVEMPLOYEE_V100 || {}, bc = r.TSVBASECOMP || {};
    const status = codeMsg(ee.EMPLOYEESTATUS);
    const payFrequency = codeMsg(bc.TSVPAYFREQUENCY), payPeriod = codeMsg(bc.TSVPAYPERIODFREQUENCY);
    const annual = arr(r.TSVANNUALCOMP).map(a => ({ year: Number(a.TSVYEAR) || null, base: num(a.TSVBASE), overtime: num(a.TSVOVERTIME), commission: num(a.TSVCOMMISSION), bonus: num(a.TSVBONUS), other: num(a.TSVOTHER), total: num(a.TSVTOTAL) }))
      .filter(a => a.year).sort((a, b) => b.year - a.year);
    const cpp = r.CURRENTPAYPERIODDETAIL_V100 || null;
    const base = { payFrequency, rateOfPay: num(bc.TSVRATEOFPAY), avgHoursPerPeriod: num(bc.TSVAVGHRSWORKED), payPeriod };
    const disclaimers = [...arr(er.ITEMIZEDDISCLAIMERS), ...arr(ee.ITEMIZEDDISCLAIMERS), ...arr(r.ITEMIZEDDISCLAIMERS)]
      .map(d => ({ type: d.DISCLAIMERTYPE || '', text: d.DISCLAIMERTEXT || d.DISCLAIMER_TEXT || '' })).filter(d => d.text);
    const fcra = r.FCRAINFO ? arr(r.FCRAINFO.FCRAINFODETAIL).map(f => ({ message: f.FCRAACTIONDETAIL?.MESSAGE || f.MESSAGE || '', twnMessage: f.FCRAACTIONDETAIL?.TWNMESSAGE || '', type: f.FCRAACTIONDETAIL?.FCRAACTIONTYPECODE || '' })) : [];
    const thisYear = new Date().getFullYear();
    return {
      srvrtid: r.SRVRTID || null,
      employer: { code: er.EMPLOYERCODE || null, name: [er.NAME1, er.NAME2].filter(Boolean).join(' ') || null, addr1: er.ADDR1 || null, city: er.CITY || null, state: er.STATE || null, postalCode: er.POSTALCODE || null, disclaimer: er.DISCLAIMER || null },
      employee: { ssnLast4: digits(ee.SSN).slice(-4) || null, alternateId: ee.ALTERNATEID || null, firstName: ee.FIRSTNAME || '', middleName: ee.MIDDLENAME || '', lastName: ee.LASTNAME || '',
        position: ee['POSITION-TITLE'] || ee.POSITIONTITLE || null, division: ee.DIVISIONCODE || null, workLocation: ee.WORKLOCATION || null },
      status: { ...status, type: STATUS_TYPE[Number(status.code)] || null },
      dates: { info: dateOf(ee.DTINFO), hire: dateOf(ee.DTMOSTRECENTHIRE), originalHire: dateOf(ee.DTORIGINALHIRE), end: dateOf(ee.DTENDEMPLOYMENT), mostRecentPay: dateOf(ee.DTMOSTRECENTPAY), transaction: dateOf(r.DTTRANSACTION) },
      lengthOfServiceMonths: num(ee.TOTALLENGTHOFSVC),
      terminationReason: ee.TERMINATIONREASON || null,
      base, monthlyBaseEstimate: monthlyBase(base),
      annual,
      ytdTotal: annual.find(a => a.year === thisYear)?.total ?? annual[0]?.total ?? null,
      priorYearTotal: annual.find(a => a.year === thisYear - 1)?.total ?? null,
      priorYear2Total: annual.find(a => a.year === thisYear - 2)?.total ?? null,
      projectedIncome: num(r.TSVPROJINCOME),
      currentPayPeriod: cpp ? { end: dateOf(cpp.DTPAYPERIODEND), paid: dateOf(cpp.DTPAID), hours: num(cpp.HOURSWORKED), gross: num(cpp.PAYPERIODINCOME_V100?.GROSSEARNINGS), net: num(cpp.PAYPERIODINCOME_V100?.NETEARNINGS) } : null,
      payPeriods: arr(r.PAYPERIODSUMMARYCOLLECTION?.PAYPERIODSUMMARY_V100).map(p => ({ end: dateOf(p.DTPAYPERIODEND), paid: dateOf(p.DTPAID), hours: num(p.HOURSWORKED), gross: num(p.GROSSEARNINGS), net: num(p.NETEARNINGS), ytdGross: num(p.YTDGROSSEARNINGS) })),
      completeness: r.COMPLETENESS || null,
      demo: !!r.DEMOTRN,
      fcra, fcraBlocked: fcra.length > 0,
      disclaimers,
    };
  });

  const ok = (status.code === '0' || status.code === '') && (signonStatus.code === '0' || signonStatus.code === '') && (employments.length > 0 || templates.length > 0 || !!trnrs.EIVREVERIFICATIONRS);
  return { ok, signon: signonStatus, status, trnuid: trnrs.TRNUID || trnrs.TRNRSMACRO?.TRNUID || null, masterSrvrtid: trnrs.MASTERSRVRTID || null,
    price: price?.price ?? null, productName: price?.productName ?? null, referenceNumber: price?.referenceNumber ?? null,
    employments, templates };
}

// ── high-level calls ────────────────────────────────────────────────────
async function verify(o) {
  const c = config();
  const xml = buildSelectRequest(o, c);
  const r = await post(xml, { multipart: !!o.pdf, c });
  const parsed = parseResponse(r.ofx);
  const pdf = r.attachments.find(a => /pdf/i.test(a.contentType) || /\.pdf$/i.test(a.name));
  return { requestXml: redact(xml), responseXml: r.ofx, parsed, pdf: pdf ? { name: pdf.name || 'TWN-verification.pdf', bytes: pdf.bytes } : null, httpStatus: r.httpStatus, durationMs: r.durationMs, env: c.env };
}
async function listTemplates(o = {}) {
  const c = config();
  const xml = buildTemplateListRequest(o, c);
  const r = await post(xml, { c });
  return { requestXml: redact(xml), responseXml: r.ofx, parsed: parseResponse(r.ofx), httpStatus: r.httpStatus, durationMs: r.durationMs, env: c.env };
}
async function reverify(o) {
  const c = config();
  const xml = buildReverifyRequest(o, c);
  const r = await post(xml, { c });
  return { requestXml: redact(xml), responseXml: r.ofx, parsed: parseResponse(r.ofx), httpStatus: r.httpStatus, durationMs: r.durationMs, env: c.env };
}
async function audit(o) {
  const c = config();
  const xml = buildAuditRequest(o, c);
  const r = await post(xml, { c });
  return { requestXml: redact(xml), responseXml: r.ofx, parsed: parseResponse(r.ofx), httpStatus: r.httpStatus, durationMs: r.durationMs, env: c.env };
}

module.exports = {
  config, publicConfig, URLS, RETURN_CODES,
  buildSelectRequest, buildTemplateListRequest, buildReverifyRequest, buildAuditRequest, validateSelect, redact,
  post, parseMultipart, parseResponse, monthlyBase,
  verify, listTemplates, reverify, audit,
};
