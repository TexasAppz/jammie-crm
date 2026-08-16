'use strict';
/**
 * server/lib/mismo.cjs
 *
 * Converts between Jammie's data model (loans + form_1003_main_borrower +
 * loan_fees rows) and MISMO 3.4 XML.
 *
 * SCOPE (deliberate, per product decision):
 *   This maps the fields Jammie's own schema already tracks. It does NOT
 *   attempt full MISMO 3.4 / DU fidelity — declarations, HMDA/government
 *   monitoring, multi-item income arrays, and REO/liability line-item
 *   detail beyond what's in liabilities_json/reos_json are intentionally
 *   out of scope. A file built here is well-formed MISMO-structured XML
 *   suitable for round-tripping within Jammie (or reasonable interchange),
 *   but is NOT guaranteed to be accepted as-is by an AUS (DU/LPA) system,
 *   which expects the full data set.
 *
 *   Fields Jammie tracks but MISMO's base schema has no slot for (LTV,
 *   DTI front/back, credit score, loan status, the 5 Cash-to-Close
 *   fields, and the itemized monthly payment breakdown) are carried in a
 *   JAMMIE_EXTENSION block under LOAN/EXTENSION/OTHER — this is the
 *   standard MISMO mechanism for lender-specific data and keeps the file
 *   structurally valid rather than inventing non-standard top-level
 *   elements.
 *
 *   Known limitation: `loans.subject_property` has no separate
 *   city/state/zip columns at all, so the MISMO ADDRESS breakdown is
 *   best-effort on export and reassembled into a single string on import.
 */

const { XMLParser } = require('fast-xml-parser');

const MISMO_NS = 'http://www.mismo.org/residential/2009/schemas';
const JAMMIE_NS = 'http://www.jammiemortgage.com/schemas/extension';

// ── helpers ────────────────────────────────────────────────────────────

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function money(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

// mysql2 returns DATE columns as JS Date objects by default, not strings.
// Naively stringifying a Date gives "Mon Jan 15 1990 00:00:00 GMT+0000...",
// which is not a valid MISMO date and fails to re-import. Always route
// date fields through this instead of tag()/esc() directly.
function dateOnly(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Already YYYY-MM-DD (or starts with it, e.g. an ISO datetime string)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function tag(name, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<${name}>${esc(value)}</${name}>`;
}

function lienPriorityType(lienPosition) {
  const m = { 'First Lien': 'FirstLien', 'Second Lien': 'SecondLien' };
  return m[lienPosition] || 'FirstLien';
}

function mortgageType(product) {
  const p = (product || '').toUpperCase();
  if (p.includes('FHA')) return 'FHA';
  if (p.includes('VA')) return 'VA';
  if (p.includes('USDA')) return 'RHS';
  if (p.includes('CONF') || p.includes('CONVENTIONAL')) return 'Conventional';
  return 'Other';
}

function reverseMortgageType(mismoType) {
  const m = { FHA: 'FHA 30 Year Fixed', VA: 'VA 30 Year Fixed', Conventional: 'CONF CONV 30 Year' };
  return m[mismoType] || null;
}

function loanPurposeType(refiType) {
  if (!refiType) return 'Purchase';
  const r = refiType.toLowerCase();
  if (r.includes('cash')) return 'CashOutRefinance';
  if (r.includes('refi')) return 'NoCashOutRefinance';
  return 'Purchase';
}

// Jammie's address_state / business_state columns are free text — the
// live data has "Georgia", "Texas", "Florida" etc, not 2-letter codes.
// MISMO's StateCode element requires the 2-letter USPS abbreviation.
// This normalizes either direction so export always emits a valid code
// and import accepts whatever the source file happens to use.
const STATE_NAME_TO_CODE = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA',
  colorado:'CO', connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA',
  hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA',
  kansas:'KS', kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD',
  massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS',
  missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV',
  'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY',
  'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK',
  oregon:'OR', pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC',
  'south dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT',
  virginia:'VA', washington:'WA', 'west virginia':'WV', wisconsin:'WI',
  wyoming:'WY', 'district of columbia':'DC',
};

function stateCode(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase(); // already a code
  return STATE_NAME_TO_CODE[s.toLowerCase()] || s; // fall back to raw value
                                                     // rather than dropping
                                                     // it silently if it's
                                                     // an unrecognized state
}

const CODE_TO_STATE_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name.replace(/\b\w/g, c => c.toUpperCase())])
);

// Import-side counterpart: Jammie's own address_state/business_state
// columns store full names ("Georgia"), so a 2-letter code coming in
// from an external MISMO file gets converted back to match — otherwise
// imported rows would show "GA" while every other row shows "Georgia",
// and the Borrower Info form's state field wouldn't recognize the code.
function stateNameFromCode(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return CODE_TO_STATE_NAME[s.toUpperCase()] || s;
  return s; // already a full name (or unrecognized) — pass through as-is
}

function safeParseJsonArray(jsonText) {
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function incomeItem(incomeType, amount) {
  const amt = money(amount);
  if (!amt || Number(amt) === 0) return '';
  return `
                    <CURRENT_INCOME_ITEM>
                      <CURRENT_INCOME_ITEM_DETAIL>
                        <CurrentIncomeMonthlyTotalAmount>${esc(amt)}</CurrentIncomeMonthlyTotalAmount>
                        <EmploymentIncomeIndicator>true</EmploymentIncomeIndicator>
                        <IncomeType>${esc(incomeType)}</IncomeType>
                      </CURRENT_INCOME_ITEM_DETAIL>
                    </CURRENT_INCOME_ITEM>`;
}

// ── EXPORT: Jammie rows -> MISMO XML string ──────────────────────────

function buildMismoXml({ loan, form1003, fees }) {
  form1003 = form1003 || {};
  fees = fees || [];

  const liabilities = safeParseJsonArray(form1003.liabilities_json);

  const collateralXml = `
      <COLLATERALS>
        <COLLATERAL>
          <SUBJECT_PROPERTY SequenceNumber="1">
            <ADDRESS>
              ${tag('AddressLineText', loan.subject_property)}
              <CountryCode>US</CountryCode>
            </ADDRESS>
          </SUBJECT_PROPERTY>
        </COLLATERAL>
      </COLLATERALS>`;

  const loanXml = `
      <LOANS>
        <LOAN>
          <AMORTIZATION>
            <AMORTIZATION_RULE>
              <AmortizationType>Fixed</AmortizationType>
              ${tag('LoanAmortizationPeriodCount', loan.amort_term)}
              <LoanAmortizationPeriodType>Month</LoanAmortizationPeriodType>
            </AMORTIZATION_RULE>
          </AMORTIZATION>
          <LOAN_IDENTIFIERS>
            <LOAN_IDENTIFIER>
              ${tag('LoanIdentifier', loan.loan_number)}
              <LoanIdentifierType>LenderLoan</LoanIdentifierType>
            </LOAN_IDENTIFIER>
          </LOAN_IDENTIFIERS>
          <TERMS_OF_LOAN>
            ${tag('BaseLoanAmount', money(loan.loan_amount))}
            <LienPriorityType>${esc(lienPriorityType(loan.lien_position))}</LienPriorityType>
            <LoanPurposeType>${esc(loanPurposeType(loan.refi_type))}</LoanPurposeType>
            <MortgageType>${esc(mortgageType(loan.product))}</MortgageType>
            ${tag('NoteAmount', money(loan.loan_amount))}
            ${tag('NoteRatePercent', loan.rate)}
          </TERMS_OF_LOAN>
          <EXTENSION>
            <OTHER>
              <JAMMIE_LOAN_EXTENSION xmlns="${JAMMIE_NS}">
                ${tag('LoanStatus', loan.loan_status)}
                ${tag('ClosingDate', dateOnly(loan.closing_date))}
                ${tag('LTVRatioPercent', loan.ltv)}
                ${tag('DTIFrontRatioPercent', loan.dti_front)}
                ${tag('DTIBackRatioPercent', loan.dti_back)}
                ${tag('CreditScore', loan.credit_score)}
                ${tag('MonthlyPrincipalAndInterestAmount', money(loan.pmt_first_mortgage))}
                ${tag('MonthlyHomeownersInsuranceAmount', money(loan.pmt_hoi))}
                ${tag('MonthlyPropertyTaxAmount', money(loan.pmt_property_taxes))}
                ${tag('MonthlyMortgageInsuranceAmount', money(loan.pmt_mi))}
                ${tag('MonthlyAssociationDuesAmount', money(loan.pmt_association_dues))}
                ${tag('MonthlyOtherAmount', money(loan.pmt_other))}
                ${tag('MonthlyOtherDescription', loan.pmt_other_desc)}
                ${tag('MonthlySupplementalAmount', money(loan.pmt_supplemental))}
                ${tag('EarnestMoneyDepositAmount', money(loan.earnest_money_deposit))}
                ${tag('SellerCreditsAmount', money(loan.seller_credits))}
                ${tag('FundsForBorrowerAmount', money(loan.funds_for_borrower))}
                ${tag('ClosingCostsFinancedAmount', money(loan.closing_costs_financed))}
                ${tag('AdjustmentsOtherCreditsAmount', money(loan.adjustments_other_credits))}
                ${tag('LenderName', loan.lender)}
                ${tag('ProductName', loan.product)}
              </JAMMIE_LOAN_EXTENSION>
            </OTHER>
          </EXTENSION>
        </LOAN>
      </LOANS>`;

  const borrowerParties = [];

  if (form1003.first_nm || form1003.last_nm) {
    borrowerParties.push(`
        <PARTY>
          <INDIVIDUAL>
            <NAME>
              ${tag('FirstName', form1003.first_nm)}
              ${tag('MiddleName', form1003.middle_nm)}
              ${tag('LastName', form1003.last_nm)}
              ${tag('FullName', [form1003.first_nm, form1003.middle_nm, form1003.last_nm].filter(Boolean).join(' '))}
            </NAME>
          </INDIVIDUAL>
          <ADDRESSES>
            <ADDRESS>
              ${tag('AddressLineText', [form1003.address_num, form1003.address_street].filter(Boolean).join(' '))}
              ${tag('CityName', form1003.address_city)}
              ${tag('StateCode', stateCode(form1003.address_state))}
              ${tag('PostalCode', form1003.address_zip)}
              <CountryCode>US</CountryCode>
              <AddressType>Current</AddressType>
            </ADDRESS>
          </ADDRESSES>
          <ROLES>
            <ROLE>
              <BORROWER>
                <BORROWER_DETAIL>
                  ${tag('BorrowerBirthDate', dateOnly(form1003.dob))}
                  <BorrowerClassificationType>Primary</BorrowerClassificationType>
                  ${tag('MaritalStatusType', form1003.marital_status)}
                </BORROWER_DETAIL>
                <CURRENT_INCOME>
                  <CURRENT_INCOME_ITEMS>${incomeItem('Base', form1003.gross_income_monthly_base)}${incomeItem('Overtime', form1003.gross_income_monthly_overtime)}${incomeItem('Bonus', form1003.gross_income_monthly_bonus)}${incomeItem('Commission', form1003.gross_income_monthly_commission)}${incomeItem('MilitaryEntitlements', form1003.gross_income_monthly_military)}${incomeItem('Other', form1003.gross_income_monthly_other)}
                  </CURRENT_INCOME_ITEMS>
                </CURRENT_INCOME>${form1003.employee_or_business_nm ? `
                <EMPLOYERS>
                  <EMPLOYER>
                    <LEGAL_ENTITY>
                      <LEGAL_ENTITY_DETAIL>
                        ${tag('FullName', form1003.employee_or_business_nm)}
                      </LEGAL_ENTITY_DETAIL>
                    </LEGAL_ENTITY>
                    <ADDRESS>
                      ${tag('AddressLineText', form1003.business_street)}
                      ${tag('CityName', form1003.business_city)}
                      ${tag('StateCode', stateCode(form1003.business_state))}
                      <CountryCode>US</CountryCode>
                    </ADDRESS>
                    <EMPLOYMENT>
                      ${tag('EmploymentPositionDescription', form1003.position_title)}
                      ${tag('EmploymentStartDate', dateOnly(form1003.position_start_date))}
                      <EmploymentStatusType>Current</EmploymentStatusType>
                      <EmploymentClassificationType>Primary</EmploymentClassificationType>
                    </EMPLOYMENT>
                  </EMPLOYER>
                </EMPLOYERS>` : ''}
              </BORROWER>
              <ROLE_DETAIL>
                <PartyRoleType>Borrower</PartyRoleType>
              </ROLE_DETAIL>
            </ROLE>
          </ROLES>${form1003.ssn ? `
          <TAXPAYER_IDENTIFIERS>
            <TAXPAYER_IDENTIFIER>
              <TaxpayerIdentifierType>SocialSecurityNumber</TaxpayerIdentifierType>
              ${tag('TaxpayerIdentifierValue', form1003.ssn)}
            </TAXPAYER_IDENTIFIER>
          </TAXPAYER_IDENTIFIERS>` : ''}
        </PARTY>`);
  }

  for (const n of [2, 3, 4]) {
    const fn = form1003[`first_nm_borrower_${n}`];
    const ln = form1003[`last_nm_borrower_${n}`];
    if (!fn && !ln) continue;
    borrowerParties.push(`
        <PARTY>
          <INDIVIDUAL>
            <NAME>
              ${tag('FirstName', fn)}
              ${tag('LastName', ln)}
              ${tag('FullName', [fn, ln].filter(Boolean).join(' '))}
            </NAME>
          </INDIVIDUAL>
          <ROLES>
            <ROLE>
              <ROLE_DETAIL>
                <PartyRoleType>Borrower</PartyRoleType>
              </ROLE_DETAIL>
            </ROLE>
          </ROLES>
        </PARTY>`);
  }

  const partiesXml = borrowerParties.length ? `
      <PARTIES>${borrowerParties.join('')}
      </PARTIES>` : '';

  const liabilityXml = liabilities.map(l => `
        <LIABILITY>
          <LIABILITY_DETAIL>
            ${tag('LiabilityMonthlyPaymentAmount', money(l.monthly_payment ?? l.payment))}
            ${tag('LiabilityType', l.type || 'Other')}
            ${tag('LiabilityUnpaidBalanceAmount', money(l.balance ?? l.unpaid_balance))}
          </LIABILITY_DETAIL>${l.creditor ? `
          <LIABILITY_HOLDER><NAME>${tag('FullName', l.creditor)}</NAME></LIABILITY_HOLDER>` : ''}
        </LIABILITY>`).join('');

  const liabilitiesXml = liabilityXml ? `
      <LIABILITIES>${liabilityXml}
      </LIABILITIES>` : '';

  return `<?xml version="1.0"?>
<MESSAGE MISMOReferenceModelIdentifier="3.4.032420160128" xmlns="${MISMO_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ABOUT_VERSIONS>
    <ABOUT_VERSION>
      <CreatedDatetime>${new Date().toISOString()}</CreatedDatetime>
    </ABOUT_VERSION>
  </ABOUT_VERSIONS>
  <DEAL_SETS>
    <DEAL_SET>
      <DEALS>
        <DEAL>${collateralXml}${liabilitiesXml}${loanXml}${partiesXml}
        </DEAL>
      </DEALS>
    </DEAL_SET>
  </DEAL_SETS>
</MESSAGE>
`;
}

// ── IMPORT: MISMO XML string -> Jammie field objects ─────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,   // strips MISMO:/DU:/ULAD: prefixes so we can match
                          // plain tag names regardless of the source namespace
  parseTagValue: false,   // CRITICAL: keep every value as a string. The
                          // default auto-number-coercion silently strips
                          // leading zeros from SSNs, zip codes, and loan
                          // numbers (e.g. "02134" -> 2134). We convert to
                          // numbers ourselves, only for genuinely numeric
                          // fields, via num()/money() below.
});

function dig(obj, path) {
  let cur = obj;
  const keys = path.split('.');
  for (let i = 0; i < keys.length; i++) {
    if (cur === undefined || cur === null) return undefined;
    if (Array.isArray(cur)) cur = cur[0]; // only when continuing to descend past this point
    cur = cur[keys[i]];
  }
  return cur; // do NOT collapse a trailing array — callers that expect
              // repeated elements (PARTY, LIABILITY, CURRENT_INCOME_ITEM)
              // explicitly handle array-vs-single themselves
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMismoXml(xmlString) {
  const parsed = parser.parse(xmlString);
  const deal = dig(parsed, 'MESSAGE.DEAL_SETS.DEAL_SET.DEALS.DEAL');
  if (!deal) {
    throw new Error('Could not find MESSAGE.DEAL_SETS.DEAL_SET.DEALS.DEAL in the uploaded file — is this a MISMO 3.4 file?');
  }

  const loanNode = dig(deal, 'LOANS.LOAN');
  const collateral = dig(deal, 'COLLATERALS.COLLATERAL.SUBJECT_PROPERTY');
  const ext = dig(loanNode, 'EXTENSION.OTHER.JAMMIE_LOAN_EXTENSION');

  const loan = {};
  if (loanNode) {
    // Deliberately NOT importing LOAN_IDENTIFIER into loan.loan_number:
    // that's Jammie's own internal identifier for this record (UNIQUE
    // constraint, referenced elsewhere in the UI). Importing a file
    // updates this loan's *data*, not which record it is.
    loan.loan_amount = num(dig(loanNode, 'TERMS_OF_LOAN.NoteAmount') ?? dig(loanNode, 'TERMS_OF_LOAN.BaseLoanAmount'));
    loan.rate = num(dig(loanNode, 'TERMS_OF_LOAN.NoteRatePercent'));
    loan.amort_term = num(dig(loanNode, 'AMORTIZATION.AMORTIZATION_RULE.LoanAmortizationPeriodCount'));
    const mtype = dig(loanNode, 'TERMS_OF_LOAN.MortgageType');
    if (mtype) loan.product = reverseMortgageType(mtype) || undefined;
    const lien = dig(loanNode, 'TERMS_OF_LOAN.LienPriorityType');
    if (lien) loan.lien_position = lien === 'SecondLien' ? 'Second Lien' : 'First Lien';
  }
  if (collateral) {
    loan.subject_property = dig(collateral, 'ADDRESS.AddressLineText') || undefined;
  }
  if (ext) {
    if (dig(ext, 'LoanStatus')) loan.loan_status = dig(ext, 'LoanStatus');
    if (dig(ext, 'ClosingDate')) loan.closing_date = dateOnly(dig(ext, 'ClosingDate'));
    loan.ltv = num(dig(ext, 'LTVRatioPercent'));
    loan.dti_front = num(dig(ext, 'DTIFrontRatioPercent'));
    loan.dti_back = num(dig(ext, 'DTIBackRatioPercent'));
    loan.credit_score = num(dig(ext, 'CreditScore'));
    loan.pmt_first_mortgage = num(dig(ext, 'MonthlyPrincipalAndInterestAmount'));
    loan.pmt_hoi = num(dig(ext, 'MonthlyHomeownersInsuranceAmount'));
    loan.pmt_property_taxes = num(dig(ext, 'MonthlyPropertyTaxAmount'));
    loan.pmt_mi = num(dig(ext, 'MonthlyMortgageInsuranceAmount'));
    loan.pmt_association_dues = num(dig(ext, 'MonthlyAssociationDuesAmount'));
    loan.pmt_other = num(dig(ext, 'MonthlyOtherAmount'));
    if (dig(ext, 'MonthlyOtherDescription')) loan.pmt_other_desc = dig(ext, 'MonthlyOtherDescription');
    loan.pmt_supplemental = num(dig(ext, 'MonthlySupplementalAmount'));
    loan.earnest_money_deposit = num(dig(ext, 'EarnestMoneyDepositAmount'));
    loan.seller_credits = num(dig(ext, 'SellerCreditsAmount'));
    loan.funds_for_borrower = num(dig(ext, 'FundsForBorrowerAmount'));
    loan.closing_costs_financed = num(dig(ext, 'ClosingCostsFinancedAmount'));
    loan.adjustments_other_credits = num(dig(ext, 'AdjustmentsOtherCreditsAmount'));
    if (dig(ext, 'LenderName')) loan.lender = dig(ext, 'LenderName');
  }
  Object.keys(loan).forEach(k => (loan[k] === undefined || loan[k] === null) && delete loan[k]);

  let parties = dig(deal, 'PARTIES.PARTY');
  if (parties && !Array.isArray(parties)) parties = [parties];
  parties = parties || [];

  const borrowerParties = parties.filter(p => dig(p, 'ROLES.ROLE.ROLE_DETAIL.PartyRoleType') === 'Borrower');

  const form1003 = {};
  const primary = borrowerParties[0];
  if (primary) {
    form1003.first_nm = dig(primary, 'INDIVIDUAL.NAME.FirstName') || undefined;
    form1003.middle_nm = dig(primary, 'INDIVIDUAL.NAME.MiddleName') || undefined;
    form1003.last_nm = dig(primary, 'INDIVIDUAL.NAME.LastName') || undefined;
    form1003.address_street = dig(primary, 'ADDRESSES.ADDRESS.AddressLineText') || undefined;
    form1003.address_city = dig(primary, 'ADDRESSES.ADDRESS.CityName') || undefined;
    form1003.address_state = stateNameFromCode(dig(primary, 'ADDRESSES.ADDRESS.StateCode')) || undefined;
    form1003.address_zip = dig(primary, 'ADDRESSES.ADDRESS.PostalCode') || undefined;
    const dob = dig(primary, 'ROLES.ROLE.BORROWER.BORROWER_DETAIL.BorrowerBirthDate');
    if (dob) form1003.dob = dateOnly(dob);
    const marital = dig(primary, 'ROLES.ROLE.BORROWER.BORROWER_DETAIL.MaritalStatusType');
    if (marital) form1003.marital_status = marital;
    const ssn = dig(primary, 'TAXPAYER_IDENTIFIERS.TAXPAYER_IDENTIFIER.TaxpayerIdentifierValue');
    if (ssn) {
      const digits = String(ssn).replace(/\D/g, '');
      form1003.ssn = digits.length === 9 ? `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}` : String(ssn);
    }

    const empName = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.LEGAL_ENTITY.LEGAL_ENTITY_DETAIL.FullName');
    if (empName) form1003.employee_or_business_nm = empName;
    const posTitle = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.EMPLOYMENT.EmploymentPositionDescription');
    if (posTitle) form1003.position_title = posTitle;
    const posStart = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.EMPLOYMENT.EmploymentStartDate');
    if (posStart) form1003.position_start_date = dateOnly(posStart);
    const empStreet = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.ADDRESS.AddressLineText');
    if (empStreet) form1003.business_street = empStreet;
    const empCity = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.ADDRESS.CityName');
    if (empCity) form1003.business_city = empCity;
    const empState = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.ADDRESS.StateCode');
    if (empState) form1003.business_state = stateNameFromCode(empState);

    let items = dig(primary, 'ROLES.ROLE.BORROWER.CURRENT_INCOME.CURRENT_INCOME_ITEMS.CURRENT_INCOME_ITEM');
    if (items && !Array.isArray(items)) items = [items];
    (items || []).forEach(item => {
      const t = dig(item, 'CURRENT_INCOME_ITEM_DETAIL.IncomeType');
      const amt = num(dig(item, 'CURRENT_INCOME_ITEM_DETAIL.CurrentIncomeMonthlyTotalAmount'));
      if (amt === null) return;
      const map = {
        Base: 'gross_income_monthly_base',
        Overtime: 'gross_income_monthly_overtime',
        Bonus: 'gross_income_monthly_bonus',
        Commission: 'gross_income_monthly_commission',
        MilitaryEntitlements: 'gross_income_monthly_military',
        Other: 'gross_income_monthly_other',
      };
      if (map[t]) form1003[map[t]] = amt;
    });
  }

  for (let i = 0; i < 3; i++) {
    const p = borrowerParties[i + 1];
    if (!p) continue;
    const n = i + 2;
    const fn = dig(p, 'INDIVIDUAL.NAME.FirstName');
    const ln = dig(p, 'INDIVIDUAL.NAME.LastName');
    if (fn) form1003[`first_nm_borrower_${n}`] = fn;
    if (ln) form1003[`last_nm_borrower_${n}`] = ln;
  }
  form1003.num_borrowers = borrowerParties.length || undefined;
  Object.keys(form1003).forEach(k => (form1003[k] === undefined || form1003[k] === null) && delete form1003[k]);

  let liabNodes = dig(deal, 'LIABILITIES.LIABILITY');
  if (liabNodes && !Array.isArray(liabNodes)) liabNodes = [liabNodes];
  if (liabNodes && liabNodes.length) {
    form1003.liabilities_json = JSON.stringify(liabNodes.map(l => ({
      type: dig(l, 'LIABILITY_DETAIL.LiabilityType') || 'Other',
      balance: num(dig(l, 'LIABILITY_DETAIL.LiabilityUnpaidBalanceAmount')),
      monthly_payment: num(dig(l, 'LIABILITY_DETAIL.LiabilityMonthlyPaymentAmount')),
      creditor: dig(l, 'LIABILITY_HOLDER.NAME.FullName') || null,
    })));
  }

  return { loan, form1003 };
}

module.exports = { buildMismoXml, parseMismoXml };
