'use strict';
/**
 * server/lib/ems.cjs
 *
 * Equifax Mortgage Solutions (EMS) — Mortgage Gateway credit report client.
 * Built against "EMS System-to-System Interface Guide (Webservices) v1.12".
 *
 * IMPORTANT: this is MISMO 2.3.1, NOT the MISMO 3.4 used for the ARIVE
 * import/export in server/lib/mismo.cjs. The two formats are unrelated:
 *   - 2.3.1 is attribute-based (<BORROWER _FirstName="..." _SSN="..."/>)
 *   - 3.4 is element-based (<FirstName>...</FirstName>)
 * Do not try to reuse code between them.
 *
 * TRANSACTION SHAPE (per the guide, "Interface Details" + Appendix K)
 *   - One endpoint for everything: POST .../services/post/MergeCreditWWW
 *   - Credentials travel INSIDE the XML body, as attributes on <REQUEST>:
 *       LoginAccountIdentifier, InternalAccountIdentifier, LoginAccountPassword
 *   - The action is selected by CreditReportRequestActionType on
 *     <CREDIT_REQUEST_DATA>: Submit | Retrieve | Reissue | Upgrade | ...
 *
 * REQUIRED FIELDS (Appendix A, "TCHL Submit Request")
 *   Submitting Party Name, both account identifiers, password,
 *   LenderCaseIdentifier (loan number), First/Last name, 9-digit SSN,
 *   and a residence street/city/state/zip. Missing any of these produces
 *   an E00x error rather than a report.
 *
 * SPECIAL CHARACTERS (guide, "Special Characters")
 *   & < > " ' inside attribute values must be entity-escaped. Borrower
 *   names like O'Brien and street names with & are common — escape
 *   EVERYTHING that goes into an attribute, never trust input.
 *
 * SOFT PULL (guide, "Pre-Qualification (Soft Pull)")
 *   The request is byte-identical to a hard pull. Soft vs hard is decided
 *   entirely by WHICH CREDENTIALS are used — EMS issues a separate account
 *   for prequalification. So `mode` below only selects the credential set.
 */

const EMS_UAT_URL = 'https://emsws-uat.equifax.com/emsws/services/post/MergeCreditWWW';

// ── XML helpers ─────────────────────────────────────────────────────────

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Emit attr="value" only when the value is present, so optional fields
// are omitted rather than sent as empty strings.
function attr(name, value) {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${esc(value)}"`;
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

// EMS wants YYYYMMDD (see _BirthDate="19631119" in Appendix K).
function toEmsDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ISO 8601 without milliseconds, matching the guide's samples.
function nowStamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

// ── Credentials ─────────────────────────────────────────────────────────

/**
 * Two credential sets: hard pull (production credit) and soft pull
 * (prequalification). EMS provisions these as separate accounts; the
 * request XML is otherwise identical.
 */
function getCredentials(mode = 'hard') {
  const prefix = mode === 'soft' ? 'EMS_SOFT_' : 'EMS_';
  const account  = process.env[`${prefix}ACCOUNT`];
  const password = process.env[`${prefix}PASSWORD`];
  const submitter = process.env.EMS_SUBMITTING_PARTY || 'Jammie Mortgage';
  const url = process.env.EMS_URL || EMS_UAT_URL;
  if (!account || !password) {
    const err = new Error(`EMS ${mode}-pull credentials are not configured (${prefix}ACCOUNT / ${prefix}PASSWORD)`);
    err.code = 'EMS_NOT_CONFIGURED';
    throw err;
  }
  return { account, password, submitter, url };
}

// ── Request validation ──────────────────────────────────────────────────

/**
 * Validate BEFORE building XML so the caller gets a specific field error
 * instead of an opaque E00x from Equifax. Mirrors Appendix A.
 */
function validateBorrower(b, label) {
  const problems = [];
  if (!b.firstName || !/[A-Za-z]/.test(b.firstName)) problems.push(`${label}: first name is required`);
  if (!b.lastName  || !/[A-Za-z]/.test(b.lastName))  problems.push(`${label}: last name is required`);
  const ssn = digitsOnly(b.ssn);
  if (ssn.length !== 9) problems.push(`${label}: SSN must be 9 digits`);
  const r = b.residence || {};
  if (!r.street) problems.push(`${label}: current street address is required`);
  if (!r.city)   problems.push(`${label}: current city is required`);
  if (!r.state || digitsOnly(r.state).length > 0 || r.state.length !== 2) problems.push(`${label}: state must be a 2-letter code`);
  if (digitsOnly(r.zip).length < 5) problems.push(`${label}: ZIP code is required`);
  return problems;
}

// ── Request builder ─────────────────────────────────────────────────────

/**
 * Build a MISMO 2.3.1 Submit request.
 *
 * @param {object} opts
 * @param {string} opts.loanNumber        -> LenderCaseIdentifier (required)
 * @param {string} opts.requestedBy       -> RequestingPartyRequestedByName (the MLO)
 * @param {object[]} opts.borrowers       1 or 2. Each: { firstName, middleName,
 *                                         lastName, suffix, ssn, dob,
 *                                         residence:{street,city,state,zip} }
 * @param {object} [opts.bureaus]         { equifax, experian, transunion } booleans; default all three
 * @param {string} [opts.mode]            'hard' | 'soft' — selects credential set only
 */
function buildSubmitRequest(opts) {
  const { loanNumber, requestedBy, borrowers = [], bureaus = {}, mode = 'hard' } = opts;

  if (!loanNumber) throw new Error('loanNumber (LenderCaseIdentifier) is required');
  if (!borrowers.length || borrowers.length > 2) throw new Error('Provide 1 borrower (Individual) or 2 (Joint)');

  const problems = borrowers.flatMap((b, i) => validateBorrower(b, i === 0 ? 'Borrower' : 'Co-borrower'));
  if (problems.length) {
    const err = new Error(problems.join('; '));
    err.code = 'EMS_VALIDATION';
    err.problems = problems;
    throw err;
  }

  const creds = getCredentials(mode);
  const joint = borrowers.length === 2;
  const bureauFlag = v => (v === false ? 'N' : 'Y');

  const borrowerXml = borrowers.map((b, i) => {
    const id = `B${i + 1}`;
    const r = b.residence;
    return `
      <BORROWER${attr('BorrowerID', id)}${attr('_FirstName', b.firstName)}${attr('_MiddleName', b.middleName)}${attr('_LastName', b.lastName)}${attr('_NameSuffix', b.suffix)}${attr('_SSN', digitsOnly(b.ssn))}${attr('_BirthDate', toEmsDate(b.dob))}${attr('_PrintPositionType', i === 0 ? 'Borrower' : 'CoBorrower')}${attr('JointAssetLiabilityReportingType', joint ? 'Jointly' : 'NotJointly')}>
        <_RESIDENCE BorrowerResidencyType="Current"${attr('_StreetAddress', r.street)}${attr('_City', r.city)}${attr('_State', String(r.state).toUpperCase())}${attr('_PostalCode', digitsOnly(r.zip).slice(0, 5))}${attr('BorrowerResidencyDurationYears', r.years != null && r.years !== '' && Number.isFinite(Number(r.years)) ? Math.round(Number(r.years)) : null)} />
      </BORROWER>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE REQUEST_GROUP SYSTEM "CreditRequest_v2_3.dtd">
<REQUEST_GROUP MISMOVersionID="2.3.1">
  <REQUESTING_PARTY${attr('_Name', creds.submitter)}>
    <PREFERRED_RESPONSE _Format="XML" _VersionIdentifier="2.3.1" />
  </REQUESTING_PARTY>
  <SUBMITTING_PARTY${attr('_Name', creds.submitter)} />
  <REQUEST${attr('RequestDatetime', nowStamp())}${attr('InternalAccountIdentifier', creds.account)}${attr('LoginAccountIdentifier', creds.account)}${attr('LoginAccountPassword', creds.password)}>
    <REQUEST_DATA>
      <CREDIT_REQUEST MISMOVersionID="2.3.1"${attr('LenderCaseIdentifier', loanNumber)}${attr('RequestingPartyRequestedByName', requestedBy || creds.submitter)}>
        <CREDIT_REQUEST_DATA CreditRequestID="CRQ1"${attr('BorrowerID', borrowers.map((_, i) => `B${i + 1}`).join(' '))} CreditReportType="Merge"${attr('CreditRequestType', joint ? 'Joint' : 'Individual')}${attr('CreditRequestDateTime', nowStamp())} CreditReportRequestActionType="Submit">
          <CREDIT_REPOSITORY_INCLUDED _EquifaxIndicator="${bureauFlag(bureaus.equifax)}" _ExperianIndicator="${bureauFlag(bureaus.experian)}" _TransUnionIndicator="${bureauFlag(bureaus.transunion)}" />
        </CREDIT_REQUEST_DATA>
        <LOAN_APPLICATION>${borrowerXml}
        </LOAN_APPLICATION>
      </CREDIT_REQUEST>
    </REQUEST_DATA>
  </REQUEST>
</REQUEST_GROUP>
`;
  return { xml, url: creds.url };
}

/**
 * Retrieve (reprint) a previously ordered report by its EMS order number.
 * Free — does not re-pull the bureaus.
 */
function buildRetrieveRequest({ reportId, loanNumber, requestedBy, joint = false, mode = 'hard' }) {
  if (!reportId) throw new Error('reportId (CreditReportIdentifier) is required');
  const creds = getCredentials(mode);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE REQUEST_GROUP SYSTEM "CreditRequest_v2_3.dtd">
<REQUEST_GROUP MISMOVersionID="2.3.1">
  <REQUESTING_PARTY${attr('_Name', creds.submitter)}>
    <PREFERRED_RESPONSE _Format="XML" _VersionIdentifier="2.3.1" />
  </REQUESTING_PARTY>
  <SUBMITTING_PARTY${attr('_Name', creds.submitter)} />
  <REQUEST${attr('RequestDatetime', nowStamp())}${attr('InternalAccountIdentifier', creds.account)}${attr('LoginAccountIdentifier', creds.account)}${attr('LoginAccountPassword', creds.password)}>
    <REQUEST_DATA>
      <CREDIT_REQUEST MISMOVersionID="2.3.1"${attr('LenderCaseIdentifier', loanNumber)}${attr('RequestingPartyRequestedByName', requestedBy || creds.submitter)}>
        <CREDIT_REQUEST_DATA${attr('CreditReportIdentifier', reportId)} CreditReportRequestActionType="Retrieve" CreditReportType="Merge"${attr('CreditRequestType', joint ? 'Joint' : 'Individual')}>
          <CREDIT_REPOSITORY_INCLUDED _EquifaxIndicator="Y" _ExperianIndicator="Y" _TransUnionIndicator="Y" />
        </CREDIT_REQUEST_DATA>
      </CREDIT_REQUEST>
    </REQUEST_DATA>
  </REQUEST>
</REQUEST_GROUP>
`;
  return { xml, url: creds.url };
}

// ── Transport ───────────────────────────────────────────────────────────

/**
 * POST the XML. EMS expects the raw XML document as the body — not JSON,
 * not form-encoded. Timeout is generous because a tri-merge pull can take
 * a while when a bureau is slow.
 */
async function send(url, xml) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Accept': 'text/xml' },
    body: xml,
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`EMS HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return body;
}

// ── Response parser ─────────────────────────────────────────────────────

const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',   // MISMO 2.x attributes already start with "_"
  parseTagValue: false,      // keep SSNs/account numbers/zip as strings
  parseAttributeValue: false,
});

const arr = v => (v === undefined || v === null) ? [] : Array.isArray(v) ? v : [v];

/**
 * Turn the EMS RESPONSE_GROUP into something the app can use.
 * Always returns { ok, status, ... }. Never throws on an EMS-level error —
 * those are data, not exceptions, and the caller should show them.
 */
function parseResponse(xmlText) {
  let doc;
  try {
    doc = parser.parse(xmlText);
  } catch (e) {
    return { ok: false, status: { code: 'PARSE', description: `Response was not XML: ${e.message}` }, raw: xmlText };
  }

  const group    = doc.RESPONSE_GROUP || {};
  const response = group.RESPONSE || {};
  const status   = response.STATUS || {};
  const creditResponse = (response.RESPONSE_DATA || {}).CREDIT_RESPONSE || {};

  // STATUS _Condition is "Success" or "Error"; error detail lives in
  // CREDIT_ERROR_MESSAGE/_Text (one or many).
  const errorTexts = arr(creditResponse.CREDIT_ERROR_MESSAGE)
    .flatMap(m => arr(m._Text))
    .map(t => (typeof t === 'string' ? t : t['#text'] || ''))
    .filter(Boolean);

  // Per the guide, STATUS only appears on ERROR responses. A successful
  // report has no STATUS element at all - success is "there is a report
  // identifier, the type is not Error, and no error message was returned".
  const isError = creditResponse.CreditReportType === 'Error'
               || status._Condition === 'Error'
               || errorTexts.length > 0;
  const result = {
    ok: !isError && !!creditResponse.CreditReportIdentifier,
    status: {
      code: status._Code || (isError ? null : 'OK'),
      condition: status._Condition || (isError ? 'Error' : 'Success'),
      description: status._Description || (isError ? errorTexts[0] || null : 'Report received'),
    },
    errors: errorTexts,
    // The EMS order number — needed for Retrieve/Reissue/Upgrade later.
    reportId: creditResponse.CreditReportIdentifier || null,
    reportType: creditResponse.CreditReportType || null,
    responseDateTime: response.ResponseDateTime || null,
    raw: xmlText,
  };

  if (!result.ok) return result;

  // ── Scores ──
  result.scores = arr(creditResponse.CREDIT_SCORE).map(s => ({
    borrowerId: s.BorrowerID || null,
    bureau: s.CreditRepositorySourceType || null,
    model: s._ModelNameType || s._ModelNameTypeOtherDescription || null,
    value: s._Value ? Number(s._Value) : null,
    date: s._Date || null,
    factors: arr(s._FACTOR).map(f => ({ code: f._Code, text: f._Text })).filter(f => f.code || f.text),
  }));

  // ── Tradelines / liabilities ──
  result.liabilities = arr(creditResponse.CREDIT_LIABILITY).map(l => ({
    id: l.CreditLiabilityID || null,
    borrowerId: l.BorrowerID || null,
    creditor: (l._CREDITOR || {})._Name || null,
    accountIdentifier: l._AccountIdentifier || null,
    accountType: l._AccountType || null,
    accountOwnershipType: l._AccountOwnershipType || null,
    accountStatus: l._AccountStatusType || null,
    accountOpenedDate: l._AccountOpenedDate || null,
    accountReportedDate: l._AccountReportedDate || null,
    unpaidBalance: l._UnpaidBalanceAmount ? Number(l._UnpaidBalanceAmount) : null,
    monthlyPayment: l._MonthlyPaymentAmount ? Number(l._MonthlyPaymentAmount) : null,
    highBalance: l._HighBalanceAmount ? Number(l._HighBalanceAmount) : null,
    creditLimit: l._CreditLimitAmount ? Number(l._CreditLimitAmount) : null,
    termsMonths: l._TermsMonthsCount ? Number(l._TermsMonthsCount) : null,
    isMortgage: l._AccountType === 'Mortgage' || l._MortgageType != null,
    derogatory: l._DerogatoryDataIndicator === 'Y',
    late30: l._LATE_COUNT ? Number(l._LATE_COUNT._30Days || 0) : null,
    late60: l._LATE_COUNT ? Number(l._LATE_COUNT._60Days || 0) : null,
    late90: l._LATE_COUNT ? Number(l._LATE_COUNT._90Days || 0) : null,
    repositories: arr(l.CREDIT_REPOSITORY).map(r => r._SourceType).filter(Boolean),
  }));

  // ── Public records, inquiries, embedded PDF ──
  result.publicRecords = arr(creditResponse.CREDIT_PUBLIC_RECORD).map(p => ({
    type: p._Type || null, dispositionType: p._DispositionType || null,
    filedDate: p._FiledDate || null, amount: p._LegalObligationAmount ? Number(p._LegalObligationAmount) : null,
  }));
  result.inquiries = arr(creditResponse.CREDIT_INQUIRY).map(q => ({
    name: q._Name || null, date: q._Date || null, purpose: q._PurposeType || null,
  }));

  // The human-readable report arrives base64-encoded in EMBEDDED_FILE.
  const embedded = arr(creditResponse.EMBEDDED_FILE).find(f => (f._Type || '').toUpperCase() === 'PDF');
  if (embedded && embedded.DOCUMENT) {
    const d = embedded.DOCUMENT;
    result.pdfBase64 = typeof d === 'string' ? d : (d['#text'] || null);
  }

  return result;
}

// ── High-level operations ───────────────────────────────────────────────

async function submitCredit(opts) {
  const { xml, url } = buildSubmitRequest(opts);
  const responseXml = await send(url, xml);
  return parseResponse(responseXml);
}

async function retrieveCredit(opts) {
  const { xml, url } = buildRetrieveRequest(opts);
  const responseXml = await send(url, xml);
  return parseResponse(responseXml);
}

module.exports = {
  buildSubmitRequest,
  buildRetrieveRequest,
  parseResponse,
  submitCredit,
  retrieveCredit,
  validateBorrower,
  EMS_UAT_URL,
};
