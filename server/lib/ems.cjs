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
  // EMS answers "Invalid or Missing Borrower First Name" for anything but letters, spaces, hyphens,
  // apostrophes and periods (an underscore or a digit in a test name wastes a pull) — check here first.
  const NAME = /^\p{L}[\p{L} .'\-]*$/u;
  if (!b.firstName || !/[A-Za-z]/.test(b.firstName)) problems.push(`${label}: first name is required`);
  else if (!NAME.test(String(b.firstName).trim())) problems.push(`${label}: first name may contain only letters, spaces, hyphens, apostrophes and periods`);
  if (!b.lastName  || !/[A-Za-z]/.test(b.lastName))  problems.push(`${label}: last name is required`);
  else if (!NAME.test(String(b.lastName).trim())) problems.push(`${label}: last name may contain only letters, spaces, hyphens, apostrophes and periods`);
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
  return buildDocument({ ...opts, action: 'Submit' });
}

function buildDocument(opts) {
  const { loanNumber, requestedBy, borrowers = [], bureaus = {}, mode = 'hard', action, reportId } = opts;

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
        <CREDIT_REQUEST_DATA CreditRequestID="CRQ1"${attr('BorrowerID', borrowers.map((_, i) => `B${i + 1}`).join(' '))}${attr('CreditReportIdentifier', reportId)} CreditReportType="Merge"${attr('CreditRequestType', joint ? 'Joint' : 'Individual')}${attr('CreditRequestDateTime', nowStamp())}${attr('CreditReportRequestActionType', action)}>
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
 *
 * Built from the SAME document as Submit, with only two differences:
 *   CreditReportRequestActionType="Retrieve" and CreditReportIdentifier set.
 * The DTD validates structure, not action type — so if Submit validates,
 * this does too. An earlier version omitted LOAN_APPLICATION and was
 * rejected with "Does Not Validate Against DTD or Schema".
 */
function buildRetrieveRequest(opts) {
  const { reportId, loanNumber, requestedBy, borrowers = [], bureaus = {}, mode = 'hard' } = opts;
  if (!reportId) throw new Error('reportId (CreditReportIdentifier) is required');
  if (!borrowers.length) throw new Error('Retrieve requires the borrower(s) from the original order');
  return buildDocument({ loanNumber, requestedBy, borrowers, bureaus, mode,
    action: 'Retrieve', reportId });
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
  // EMS's first _Text is usually the generic "Transaction type: REQUEST ERROR";
  // the reason is in the following lines. Say the reason, keep every line in `errors`.
  const reasonTexts = errorTexts.filter(t => !/^transaction type\s*:/i.test(t));
  const reason = reasonTexts.join(' · ') || errorTexts.join(' · ') || null;
  // Some errors carry no <STATUS>; pick the code out of the text when it is there ("E707", "E037 ...").
  const codeFromText = (errorTexts.join(' ').match(/\b([ES]\d{3})\b/) || [])[1] || null;
  const result = {
    ok: !isError && !!creditResponse.CreditReportIdentifier,
    status: {
      code: status._Code || (isError ? codeFromText : 'OK'),
      condition: status._Condition || (isError ? 'Error' : 'Success'),
      description: status._Description || (isError ? reason : 'Report received'),
    },
    errors: errorTexts,
    // The EMS order number — needed for Retrieve/Reissue/Upgrade later.
    reportId: creditResponse.CreditReportIdentifier || null,
    reportType: creditResponse.CreditReportType || null,
    responseDateTime: response.ResponseDateTime || null,
    raw: xmlText,
  };

  if (!result.ok) return result;

  const num = v => (v === undefined || v === null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

  // ── Scores ──
  // _Value arrives zero-padded ("00694"); Number() handles that. The model
  // name is in _ModelNameTypeOtherDescription when _ModelNameType="Other"
  // (that is how EMS labels FICO 10T / Classic 04 — Appendix C).
  result.scores = arr(creditResponse.CREDIT_SCORE).map(s => ({
    id: s.CreditScoreID || null,
    borrowerId: s.BorrowerID || null,
    bureau: s.CreditRepositorySourceType || null,
    model: (s._ModelNameType && s._ModelNameType !== 'Other') ? s._ModelNameType : (s._ModelNameTypeOtherDescription || s._ModelNameType || null),
    value: num(s._Value),
    date: s._Date || null,
    factaInquiries: s._FACTAInquiriesIndicator === 'Y',
    factors: arr(s._FACTOR).map(f => ({ code: f._Code, text: f._Text })).filter(f => f.code || f.text),
  }));

  // ── Borrowers as the bureaus identified them (one CREDIT_FILE per bureau) ──
  result.files = arr(creditResponse.CREDIT_FILE).map(f => ({
    id: f.CreditFileID || null, borrowerId: f.BorrowerID || null,
    bureau: f.CreditRepositorySourceType || null, resultStatus: f._ResultStatusType || null, infileDate: f._InfileDate || null,
    name: f._BORROWER ? [f._BORROWER._FirstName, f._BORROWER._MiddleName, f._BORROWER._LastName].filter(Boolean).join(' ') : null,
  }));

  // ── Tradelines / liabilities ──
  result.liabilities = arr(creditResponse.CREDIT_LIABILITY).map(l => ({
    id: l.CreditLiabilityID || null,
    borrowerId: l.BorrowerID || null,
    creditor: (l._CREDITOR || {})._Name || null,
    creditorAddress: l._CREDITOR ? [l._CREDITOR._StreetAddress, l._CREDITOR._City, l._CREDITOR._State, l._CREDITOR._PostalCode].filter(Boolean).join(', ') || null : null,
    accountIdentifier: l._AccountIdentifier || null,
    accountType: l._AccountType || null,                 // Mortgage | Revolving | Installment | Open
    loanType: l.CreditLoanType || null,                  // Automobile | CreditCard | ConventionalRealEstateMortgage | Educational | …
    accountOwnershipType: l._AccountOwnershipType || null,
    accountStatus: l._AccountStatusType || null,         // Open | Closed | Paid | Transferred | …
    accountOpenedDate: l._AccountOpenedDate || null,
    accountClosedDate: l._AccountClosedDate || null,
    accountReportedDate: l._AccountReportedDate || null,
    lastActivityDate: l._LastActivityDate || null,
    unpaidBalance: num(l._UnpaidBalanceAmount),
    monthlyPayment: num(l._MonthlyPaymentAmount),
    pastDue: num(l._PastDueAmount),
    highBalance: num(l._HighBalanceAmount),
    creditLimit: num(l._CreditLimitAmount),
    termsMonths: num(l._TermsMonthsCount),
    monthsReviewed: num(l._MonthsReviewedCount),
    isMortgage: l._AccountType === 'Mortgage' || l._MortgageType != null || /Mortgage/i.test(l.CreditLoanType || ''),
    derogatory: l._DerogatoryDataIndicator === 'Y',
    disputed: l._ConsumerDisputeIndicator === 'Y',
    currentRating: l._CURRENT_RATING ? (l._CURRENT_RATING._Type || l._CURRENT_RATING._Code || null) : null,
    late30: l._LATE_COUNT ? Number(l._LATE_COUNT._30Days || 0) : null,
    late60: l._LATE_COUNT ? Number(l._LATE_COUNT._60Days || 0) : null,
    late90: l._LATE_COUNT ? Number(l._LATE_COUNT._90Days || 0) : null,
    paymentPattern: l._PAYMENT_PATTERN ? (l._PAYMENT_PATTERN._Data || null) : null,
    repositories: arr(l.CREDIT_REPOSITORY).map(r => r._SourceType).filter(Boolean),
    comments: arr(l.CREDIT_COMMENT).flatMap(c => arr(c._Text)).map(t => (typeof t === 'string' ? t : t['#text'] || '')).filter(Boolean),
  }));

  // ── Public records, inquiries, embedded PDF ──
  result.publicRecords = arr(creditResponse.CREDIT_PUBLIC_RECORD).map(p => ({
    id: p.CreditPublicRecordID || null, borrowerId: p.BorrowerID || null,
    type: p._Type || null, dispositionType: p._DispositionType || null, dispositionDate: p._DispositionDate || null,
    filedDate: p._FiledDate || null, amount: num(p._LegalObligationAmount), court: p._CourtName || null, docket: p._DocketIdentifier || null,
    repositories: arr(p.CREDIT_REPOSITORY).map(r => r._SourceType).filter(Boolean),
  }));
  result.inquiries = arr(creditResponse.CREDIT_INQUIRY).map(q => ({
    id: q.CreditInquiryID || null, borrowerId: q.BorrowerID || null,
    name: q._Name || null, date: q._Date || null, purpose: q._PurposeType || null, businessType: q.CreditBusinessType || null,
    repositories: arr(q.CREDIT_REPOSITORY).map(r => r._SourceType).filter(Boolean),
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
  const t0 = Date.now();
  const responseXml = await send(url, xml);
  return { ...parseResponse(responseXml), requestXml: redact(xml), durationMs: Date.now() - t0 };
}

async function retrieveCredit(opts) {
  const { xml, url } = buildRetrieveRequest(opts);
  const t0 = Date.now();
  const responseXml = await send(url, xml);
  return { ...parseResponse(responseXml), requestXml: redact(xml), durationMs: Date.now() - t0 };
}

// ── Derived views ───────────────────────────────────────────────────────

/**
 * Qualifying (representative) score per borrower, the way mortgage
 * underwriting picks it: middle of three, lower of two, the one when only
 * one bureau returned a score. Returns [{ borrowerId, qualifying, basis, bureau, scores }].
 */
function qualifyingScores(scores = []) {
  const byBorrower = {};
  for (const s of scores) {
    if (s.value == null) continue;
    (byBorrower[s.borrowerId || 'B1'] ||= []).push(s);
  }
  return Object.entries(byBorrower).map(([borrowerId, list]) => {
    const sorted = [...list].sort((a, b) => a.value - b.value);
    let pick, basis;
    if (sorted.length >= 3) { pick = sorted[Math.floor(sorted.length / 2)]; basis = `middle of ${sorted.length}`; }
    else if (sorted.length === 2) { pick = sorted[0]; basis = 'lower of 2'; }
    else { pick = sorted[0]; basis = 'only score returned'; }
    return { borrowerId, qualifying: pick.value, basis, bureau: pick.bureau, model: pick.model, scores: list.map(s => ({ bureau: s.bureau, value: s.value, model: s.model })) };
  });
}

/** Strip what must not leave the server: the account password and SSNs. */
function redact(xml) {
  return String(xml || '')
    .replace(/LoginAccountPassword="[^"]*"/g, 'LoginAccountPassword="***"')
    .replace(/_SSN="(\d{5})(\d{4})"/g, '_SSN="*****$2"')
    .replace(/_SSN="\d[^"]*"/g, '_SSN="***"');
}

/** Appendix B, the codes an MLO can act on. Anything else shows EMS's own text. */
const FRIENDLY = {
  E002: 'Borrower first name is missing.', E003: 'Borrower last name is missing.', E004: 'Borrower SSN is missing or not 9 digits.',
  E005: 'Borrower current address is incomplete.', E006: 'Borrower current address is incomplete.',
  E037: 'EMS rejected the account password (or the account is suspended). Check EMS_PASSWORD in .env.',
  E046: 'EMS rejected the login ID. Check EMS_ACCOUNT in .env.',
  E063: 'Loan number is missing or invalid.',
  E605: 'The request XML was not well formed (a special character in a name or address was not escaped).',
  E707: 'Borrower SSN does not match the bureaus\' records (9-for-9 SSN match failed). Check the SSN on Borrower Info.',
  E708: 'Borrower SSN does not match, co-borrower matches.', E709: 'Borrower SSN matches, co-borrower SSN does not match.',
  E710: 'Neither the borrower nor the co-borrower SSN matches the bureaus\' records.',
  E901: 'Experian is not available right now. Retry later or order without Experian.',
  S100: 'EMS could not process the order.', S104: 'The order is still processing at EMS — use Retrieve again in a few minutes.',
};
function friendly(code, fallback) { return (code && FRIENDLY[String(code).toUpperCase()]) || fallback || null; }

module.exports = {
  buildSubmitRequest,
  buildRetrieveRequest,
  parseResponse,
  submitCredit,
  retrieveCredit,
  validateBorrower,
  qualifyingScores,
  redact,
  friendly,
  EMS_UAT_URL,
};
