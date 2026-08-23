'use strict';
/**
 * server/lib/mismo.cjs
 *
 * Converts between Jammie's data model (loans + form_1003_main_borrower +
 * loan_fees rows) and MISMO 3.4 XML.
 *
 * SCOPE (deliberate, per product decision):
 *   This maps the fields Jammie's own schema already tracks. It does NOT
 *   attempt full MISMO 3.4 / DU fidelity — PROPERTY_DETAIL, PROPERTY_
 *   VALUATIONS, and GOVERNMENT_MONITORING (HMDA) are intentionally out of
 *   scope, since Jammie's schema has no columns for them at all (this
 *   would need new DB tables — a real scope expansion, not a code fix).
 *
 *   Everything else flagged in the 2026-08-16 Arive/UWM file comparison
 *   IS fixed here: SSN digits-only, DU/ULAD/xlink namespaces on the
 *   root, SequenceNumber/LoanRoleType/xlink:label on LOAN, a REFINANCE
 *   section when the loan isn't a purchase, ASSETS export (Jammie
 *   already captures this in assets_json, it just wasn't wired up),
 *   EmploymentIncomeIndicator only true when a real EMPLOYER record
 *   exists, a RELATIONSHIPS section linking LIABILITY/ASSET to the
 *   borrower and CURRENT_INCOME_ITEM to EMPLOYER via xlink, a numeric-
 *   only LoanIdentifier, and the JAMMIE extension using a proper
 *   namespace prefix instead of redefining the default namespace.
 *
 *   Fields Jammie tracks but MISMO's base schema has no slot for (LTV,
 *   DTI front/back, credit score, loan status, the 5 Cash-to-Close
 *   fields, and the itemized monthly payment breakdown) are carried in a
 *   JAMMIE:JAMMIE_LOAN_EXTENSION block under LOAN/EXTENSION/OTHER, using
 *   a dedicated namespace prefix — this is the standard MISMO mechanism
 *   for lender-specific data (mirrors how DU:/ULAD: extensions work in
 *   real DU/Arive files) and keeps the file structurally valid.
 *
 *   Known limitation: `loans.subject_property` has no separate
 *   city/state/zip columns at all, so the MISMO ADDRESS breakdown is
 *   best-effort on export and reassembled into a single string on import.
 */

const { XMLParser } = require('fast-xml-parser');

const MISMO_NS  = 'http://www.mismo.org/residential/2009/schemas';
const JAMMIE_NS = 'http://www.jammiemortgage.com/schemas/extension';
// Real values confirmed against an actual DU/Arive MISMO 3.4 export —
// not guessed. See discrepancy #2 in the 2026-08-16 comparison.
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const DU_NS    = 'http://www.datamodelextension.org/Schema/DU';
const ULAD_NS  = 'http://www.datamodelextension.org/Schema/ULAD';

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
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function tag(name, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<${name}>${esc(value)}</${name}>`;
}

// Discrepancy #1: working files send SSN as digits only ("824417255"),
// Jammie's own display format uses hyphens ("824-41-7255"). Strip on
// export; import already normalizes either direction.
function ssnDigits(v) {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, '');
  return digits || null;
}

// Discrepancy #7: working files use a purely numeric LenderLoan
// identifier ("1226530433"); Jammie's own loan_number is alphanumeric
// ("L1786854205714"). Strip the non-numeric prefix rather than
// inventing a new identifier — if that leaves nothing (edge case),
// fall back to the DB's own numeric auto-increment id, which is always
// numeric and always unique.
function numericLoanIdentifier(loanNumber, loanId) {
  const digits = String(loanNumber || '').replace(/\D/g, '');
  if (digits) return digits;
  return loanId ? String(loanId) : null;
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

// Maps Jammie's refi_type dropdown labels to the MISMO purpose/cash-out
// pair that Arive actually emits: LoanPurposeType is plain "Refinance",
// with the cash-out detail carried separately in the REFINANCE section.
function loanPurposeType(refiType) {
  return refiType ? 'Refinance' : 'Purchase';
}

function cashOutDeterminationType(refiType) {
  const r = (refiType || '').toLowerCase();
  if (r.includes('limited')) return 'LimitedCashOut';
  if (r.includes('cash')) return 'CashOut';   // "Cash-Out"
  return 'NoCashOut';                          // "Rate & Term"
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
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return STATE_NAME_TO_CODE[s.toLowerCase()] || s;
}

const CODE_TO_STATE_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name.replace(/\b\w/g, c => c.toUpperCase())])
);

function stateNameFromCode(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return CODE_TO_STATE_NAME[s.toUpperCase()] || s;
  return s;
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

// Best-effort mapping from Jammie's free-text asset category to a MISMO
// AssetType enum value.
function assetType(jammieType) {
  const t = (jammieType || '').toLowerCase();
  if (t.includes('checking')) return 'CheckingAccount';
  if (t.includes('saving')) return 'SavingsAccount';
  if (t.includes('retirement') || t.includes('401k') || t.includes('ira')) return 'Retirement';
  if (t.includes('stock') || t.includes('bond') || t.includes('mutual')) return 'Stock';
  return 'Other';
}

// Discrepancy #5 (partial): only claim EmploymentIncomeIndicator=true
// when a real EMPLOYER record actually exists in the same file — the
// original code hardcoded `true` unconditionally, creating an "orphan"
// reference (income claims to be employment-based, but no EMPLOYER
// exists to back it up) whenever a borrower had income figures entered
// without an employer name. Also now carries an xlink:label so it can
// be linked to EMPLOYER_1 via RELATIONSHIPS, matching real DU/Arive
// files.
function incomeItem(incomeType, amount, label, hasEmployer) {
  const amt = money(amount);
  if (!amt || Number(amt) === 0) return '';
  return `
                    <CURRENT_INCOME_ITEM SequenceNumber="1" xlink:label="${label}">
                      <CURRENT_INCOME_ITEM_DETAIL>
                        <CurrentIncomeMonthlyTotalAmount>${esc(amt)}</CurrentIncomeMonthlyTotalAmount>
                        <EmploymentIncomeIndicator>${hasEmployer ? 'true' : 'false'}</EmploymentIncomeIndicator>
                        <IncomeType>${esc(incomeType)}</IncomeType>
                      </CURRENT_INCOME_ITEM_DETAIL>
                    </CURRENT_INCOME_ITEM>`;
}

// ── EXPORT: Jammie rows -> MISMO XML string ──────────────────────────

function buildMismoXml({ loan, form1003, fees }) {
  form1003 = form1003 || {};
  fees = fees || [];

  const liabilities = safeParseJsonArray(form1003.liabilities_json);
  const assets = safeParseJsonArray(form1003.assets_json);
  const reoCount = safeParseJsonArray(form1003.reos_json).length;
  const hasPrimaryBorrower = !!(form1003.first_nm || form1003.last_nm);

  // Tracks every xlink:from/xlink:to link needed for RELATIONSHIPS,
  // built up as each section below is assembled (discrepancy #6).
  const relationships = [];

  // ---- COLLATERAL ----
  // PROPERTY_DETAIL / PROPERTY_VALUATIONS intentionally not built —
  // Jammie's schema has no columns for square footage, year built (as
  // a structured value), appraised value detail, etc. Flagged as a
  // known gap, not silently faked.
  // Reverse maps: Jammie stores spaced display labels; MISMO expects
  // CamelCase enums. Mirrors the import-side maps.
  const CONSTRUCTION_TO_MISMO = { 'Site Built':'SiteBuilt', 'Manufactured':'Manufactured', 'Modular':'Modular', 'On Frame Modular':'OnFrameModular' };
  const OCCUPANCY_TO_MISMO = { 'Primary Residence':'PrimaryResidence', 'Second Home':'SecondHome', 'Investment':'Investment' };
  const ESTATE_TO_MISMO = { 'Fee Simple':'FeeSimple', 'Leasehold':'Leasehold' };

  // Subject property address: prefer the STRUCTURED parts from form_1003
  // (sp_city/sp_state/sp_zip/sp_county). loans.subject_property is a single
  // display string — exporting it alone as AddressLineText is what made
  // Arive show City/State/ZIP/County blank on import.
  const spLine = form1003.sp_addr1 || loan.subject_property;
  // ZIP may be stored as "30188-4676"; MISMO wants digits only.
  const spZipDigits = form1003.sp_zip ? String(form1003.sp_zip).replace(/\D/g, '') : null;
  // County round-trips as a bare name ("Cherokee"); MISMO convention
  // includes the suffix, matching what real Arive exports contain.
  const spCounty = form1003.sp_county
    ? (/county$/i.test(form1003.sp_county) ? form1003.sp_county : `${form1003.sp_county} County`)
    : null;

  const propertyDetailInner = [
    tag('PropertyEstimatedValueAmount', money(loan.appraised_value)),
    tag('PropertyExistingLienAmount', money(loan.existing_liens_amount)),
    tag('FinancedUnitCount', form1003.num_units),
    tag('AttachmentType', form1003.attachment_type),
    form1003.construction_method ? tag('ConstructionMethodType', CONSTRUCTION_TO_MISMO[form1003.construction_method] || form1003.construction_method) : '',
    form1003.occupancy ? tag('PropertyUsageType', OCCUPANCY_TO_MISMO[form1003.occupancy] || form1003.occupancy) : '',
    form1003.property_rights ? tag('PropertyEstateType', ESTATE_TO_MISMO[form1003.property_rights] || form1003.property_rights) : '',
    tag('PropertyStructureBuiltYear', form1003.year_built),
    tag('PropertyAcquiredYear', form1003.year_acquired),
    tag('LotSizeAcreageNumber', form1003.acreage),
    tag('PropertyOriginalCostAmount', money(form1003.orig_cost)),
    form1003.prop_type === 'Condominium' ? '<PropertyInProjectIndicator>true</PropertyInProjectIndicator>' : '',
    form1003.prop_type === 'PUD' ? '<PUDIndicator>true</PUDIndicator>' : '',
  ].filter(Boolean).join('\n              ');

  const collateralXml = `
      <COLLATERALS>
        <COLLATERAL>
          <SUBJECT_PROPERTY SequenceNumber="1">
            <ADDRESS>
              ${tag('AddressLineText', spLine)}
              ${tag('AddressUnitIdentifier', form1003.sp_unit)}
              ${tag('CityName', form1003.sp_city)}
              <CountryCode>US</CountryCode>
              ${tag('CountyName', spCounty)}
              ${tag('PostalCode', spZipDigits)}
              ${tag('StateCode', stateCode(form1003.sp_state))}
            </ADDRESS>${propertyDetailInner ? `
            <PROPERTY_DETAIL>
              ${propertyDetailInner}
            </PROPERTY_DETAIL>` : ''}${loan.appraised_value ? `
            <PROPERTY_VALUATIONS>
              <PROPERTY_VALUATION>
                <PROPERTY_VALUATION_DETAIL>
                  ${tag('PropertyValuationAmount', money(loan.appraised_value))}
                </PROPERTY_VALUATION_DETAIL>
              </PROPERTY_VALUATION>
            </PROPERTY_VALUATIONS>` : ''}${loan.sales_price ? `
            <SALES_CONTRACTS>
              <SALES_CONTRACT>
                <SALES_CONTRACT_DETAIL>
                  ${tag('SalesContractAmount', money(loan.sales_price))}
                </SALES_CONTRACT_DETAIL>
              </SALES_CONTRACT>
            </SALES_CONTRACTS>` : ''}
          </SUBJECT_PROPERTY>
        </COLLATERAL>
      </COLLATERALS>`;

  // ---- EMPLOYER + CURRENT_INCOME_ITEMS (built first so we can assign
  // labels and record relationships before the PARTY XML is assembled) ----
  const hasEmployer = !!form1003.employee_or_business_nm;
  const incomeDefs = [
    ['Base', form1003.gross_income_monthly_base],
    ['Overtime', form1003.gross_income_monthly_overtime],
    ['Bonus', form1003.gross_income_monthly_bonus],
    ['Commission', form1003.gross_income_monthly_commission],
    ['MilitaryEntitlements', form1003.gross_income_monthly_military],
    ['Other', form1003.gross_income_monthly_other],
  ];
  let incomeCounter = 0;
  const incomeItemsXml = incomeDefs.map(([type, amt]) => {
    const m = money(amt);
    if (!m || Number(m) === 0) return '';
    incomeCounter++;
    const label = `CURRENT_INCOME_ITEM_${incomeCounter}`;
    if (hasEmployer) {
      relationships.push({ from: label, to: 'EMPLOYER_1', arcrole: 'CURRENT_INCOME_ITEM_IsAssociatedWith_EMPLOYER' });
    }
    return incomeItem(type, m, label, hasEmployer);
  }).join('');

  const employerXml = hasEmployer ? `
                <EMPLOYERS>
                  <EMPLOYER SequenceNumber="1" xlink:label="EMPLOYER_1">
                    <LEGAL_ENTITY>
                      <LEGAL_ENTITY_DETAIL>
                        ${tag('FullName', form1003.employee_or_business_nm)}
                      </LEGAL_ENTITY_DETAIL>
                    </LEGAL_ENTITY>
                    <ADDRESS>
                      ${tag('AddressLineText', form1003.business_street)}
                      ${tag('CityName', form1003.business_city)}
                      <CountryCode>US</CountryCode>
                      ${tag('StateCode', stateCode(form1003.business_state))}
                    </ADDRESS>
                    <EMPLOYMENT>
                      ${tag('EmploymentPositionDescription', form1003.position_title)}
                      ${tag('EmploymentStartDate', dateOnly(form1003.position_start_date))}
                      <EmploymentStatusType>Current</EmploymentStatusType>
                      <EmploymentClassificationType>Primary</EmploymentClassificationType>
                    </EMPLOYMENT>
                  </EMPLOYER>
                </EMPLOYERS>` : '';

  // ---- LOAN ----
  const purpose = loanPurposeType(loan.refi_type);
  // Discrepancy #4: build a real REFINANCE section (sibling of
  // TERMS_OF_LOAN, matching real DU/Arive file structure) whenever the
  // derived purpose isn't Purchase, instead of declaring a purpose with
  // no supporting section either way.
  const refinanceXml = purpose !== 'Purchase' ? `
          <REFINANCE>
            <RefinanceCashOutDeterminationType>${esc(cashOutDeterminationType(loan.refi_type))}</RefinanceCashOutDeterminationType>
            ${tag('RefinancePrimaryPurposeType', loan.cash_out_purpose || 'LimitedCashOut')}
            ${tag('RefinanceExistingLiensAmount', money(loan.existing_liens_amount))}
            ${tag('RefinanceProgramIdentifier', loan.refinance_program)}
          </REFINANCE>` : '';

  // Proposed Monthly Payment breakdown — mirrors how Arive emits it, so a
  // Jammie -> Arive round trip preserves the payment detail rather than
  // dropping it into the Jammie-only extension block.
  const housingExpenseDefs = [
    ['FirstMortgagePrincipalAndInterest', loan.pmt_first_mortgage],
    ['MIPremium', loan.pmt_mi],
    ['HomeownersInsurance', loan.pmt_hoi],
    ['RealEstateTax', loan.pmt_property_taxes],
    ['HomeownersAssociationDuesAndCondominiumFees', loan.pmt_association_dues],
    ['SupplementalPropertyInsurance', loan.pmt_supplemental],
    ['OtherHousingExpense', loan.pmt_other],
  ];
  const housingExpensesXml = housingExpenseDefs
    .filter(([, amt]) => money(amt) && Number(money(amt)) !== 0)
    .map(([type, amt]) => `
            <HOUSING_EXPENSE>
              <HousingExpensePaymentAmount>${esc(money(amt))}</HousingExpensePaymentAmount>
              <HousingExpenseTimingType>Proposed</HousingExpenseTimingType>
              <HousingExpenseType>${esc(type)}</HousingExpenseType>
            </HOUSING_EXPENSE>`).join('');
  // CLOSING_INFORMATION + URLA totals — written to the same locations the
  // import reads them from, so the closing figures round-trip.
  const closingInfoXml = (loan.cash_to_borrower || loan.lender_credit_amount) ? `
          <CLOSING_INFORMATION>${loan.lender_credit_amount ? `
            <CLOSING_ADJUSTMENT_ITEMS>
              <CLOSING_ADJUSTMENT_ITEM>
                <CLOSING_ADJUSTMENT_ITEM_DETAIL>
                  ${tag('ClosingAdjustmentItemAmount', money(loan.lender_credit_amount))}
                  <ClosingAdjustmentItemType>LenderCredit</ClosingAdjustmentItemType>
                </CLOSING_ADJUSTMENT_ITEM_DETAIL>
              </CLOSING_ADJUSTMENT_ITEM>
            </CLOSING_ADJUSTMENT_ITEMS>` : ''}${loan.cash_to_borrower ? `
            <CLOSING_INFORMATION_DETAIL>
              ${tag('CashToBorrowerAtClosingAmount', money(loan.cash_to_borrower))}
            </CLOSING_INFORMATION_DETAIL>` : ''}
          </CLOSING_INFORMATION>` : '';

  const urlaXml = (loan.estimated_closing_costs || loan.prepaid_items_estimated) ? `
          <DOCUMENT_SPECIFIC_DATA_SETS>
            <DOCUMENT_SPECIFIC_DATA_SET>
              <URLA>
                <URLA_DETAIL>
                  ${tag('EstimatedClosingCostsAmount', money(loan.estimated_closing_costs))}
                  ${tag('PrepaidItemsEstimatedAmount', money(loan.prepaid_items_estimated))}
                </URLA_DETAIL>
              </URLA>
            </DOCUMENT_SPECIFIC_DATA_SET>
          </DOCUMENT_SPECIFIC_DATA_SETS>` : '';

  const housingXml = housingExpensesXml ? `
          <HOUSING_EXPENSES>${housingExpensesXml}
          </HOUSING_EXPENSES>` : '';

  const numericLoanId = numericLoanIdentifier(loan.loan_number, loan.id);

  const loanXml = `
      <LOANS>
        <LOAN LoanRoleType="SubjectLoan" xlink:label="LOAN_1" SequenceNumber="1">
          <AMORTIZATION>
            <AMORTIZATION_RULE>
              <AmortizationType>Fixed</AmortizationType>
              ${tag('LoanAmortizationPeriodCount', loan.amort_term)}
              <LoanAmortizationPeriodType>Month</LoanAmortizationPeriodType>
            </AMORTIZATION_RULE>
          </AMORTIZATION>
${closingInfoXml}${urlaXml}${housingXml}
          <LOAN_DETAIL>
            ${tag('ApplicationReceivedDate', dateOnly(loan.created_at) || dateOnly(new Date()))}
            <BalloonIndicator>false</BalloonIndicator>
            <BelowMarketSubordinateFinancingIndicator>false</BelowMarketSubordinateFinancingIndicator>
            <BuydownTemporarySubsidyFundingIndicator>false</BuydownTemporarySubsidyFundingIndicator>
            <ConstructionLoanIndicator>false</ConstructionLoanIndicator>
            <ConversionOfContractForDeedIndicator>false</ConversionOfContractForDeedIndicator>
            ${tag('InitialFixedPeriodEffectiveMonthsCount', loan.amort_term || 360)}
            <InterestOnlyIndicator>false</InterestOnlyIndicator>
            <NegativeAmortizationIndicator>false</NegativeAmortizationIndicator>
            <PrepaymentPenaltyIndicator>false</PrepaymentPenaltyIndicator>
            ${tag('TotalMortgagedPropertiesCount', reoCount)}
          </LOAN_DETAIL>
          <LOAN_IDENTIFIERS>
            <LOAN_IDENTIFIER>
              ${tag('LoanIdentifier', numericLoanId)}
              <LoanIdentifierType>LenderLoan</LoanIdentifierType>
            </LOAN_IDENTIFIER>
          </LOAN_IDENTIFIERS>${refinanceXml}
          <TERMS_OF_LOAN>
            ${tag('BaseLoanAmount', money(loan.loan_amount))}
            <LienPriorityType>${esc(lienPriorityType(loan.lien_position))}</LienPriorityType>
            <LoanPurposeType>${esc(purpose)}</LoanPurposeType>
            <MortgageType>${esc(mortgageType(loan.product))}</MortgageType>
            ${tag('NoteAmount', money(loan.loan_amount))}
            ${tag('NoteRatePercent', loan.rate)}
          </TERMS_OF_LOAN>
          <EXTENSION>
            <OTHER>
              <JAMMIE:JAMMIE_LOAN_EXTENSION>
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
                ${tag('JammieLoanNumber', loan.loan_number)}
              </JAMMIE:JAMMIE_LOAN_EXTENSION>
            </OTHER>
          </EXTENSION>
        </LOAN>
      </LOANS>`;

  // ---- Sections Jammie has no data for, emitted with conservative
  // defaults so the file is structurally complete for Arive/DU. Every
  // indicator defaults to false (the safe "not applicable" answer);
  // MILITARY_SERVICE is deliberately an empty element, exactly as the
  // real Arive export emits it when there's no military service. ----
  const counselingXml = `
                <COUNSELING>
                  <COUNSELING_EVENTS>
                    <COUNSELING_EVENT>
                      <COUNSELING_EVENT_DETAIL>
                        <CounselingConfirmationIndicator>false</CounselingConfirmationIndicator>
                        <CounselingType>Education</CounselingType>
                      </COUNSELING_EVENT_DETAIL>
                    </COUNSELING_EVENT>
                    <COUNSELING_EVENT>
                      <COUNSELING_EVENT_DETAIL>
                        <CounselingConfirmationIndicator>false</CounselingConfirmationIndicator>
                        <CounselingType>Counseling</CounselingType>
                      </COUNSELING_EVENT_DETAIL>
                    </COUNSELING_EVENT>
                  </COUNSELING_EVENTS>
                </COUNSELING>`;

  const militaryServicesXml = `
                <MILITARY_SERVICES>
                  <MILITARY_SERVICE/>
                </MILITARY_SERVICES>`;

  // ---- PARTIES ----
  // Helper blocks below cover data Jammie imports but previously never
  // exported — email/phone, citizenship, declarations, demographics and
  // current-residence occupancy. Their absence is why Arive showed those
  // fields blank when importing a Jammie-generated file.

  // CONTACT_POINTS — email and phones
  const contactPointsXml = (() => {
    const pts = [];
    if (form1003.email) pts.push(`
              <CONTACT_POINT>
                <CONTACT_POINT_EMAIL>
                  ${tag('ContactPointEmailValue', form1003.email)}
                </CONTACT_POINT_EMAIL>
                <CONTACT_POINT_DETAIL>
                  <ContactPointRoleType>Home</ContactPointRoleType>
                </CONTACT_POINT_DETAIL>
              </CONTACT_POINT>`);
    const addPhone = (value, role) => {
      if (!value) return;
      const digits = String(value).replace(/\D/g, '');
      if (!digits) return;
      pts.push(`
              <CONTACT_POINT>
                <CONTACT_POINT_TELEPHONE>
                  <ContactPointTelephoneValue>${esc(digits)}</ContactPointTelephoneValue>
                </CONTACT_POINT_TELEPHONE>
                <CONTACT_POINT_DETAIL>
                  <ContactPointRoleType>${esc(role)}</ContactPointRoleType>
                </CONTACT_POINT_DETAIL>
              </CONTACT_POINT>`);
    };
    addPhone(form1003.cell_phone, 'Mobile');
    addPhone(form1003.phone, 'Home');
    return pts.length ? `
            <CONTACT_POINTS>${pts.join('')}
            </CONTACT_POINTS>` : '';
  })();

  // DECLARATION — citizenship/residency plus the 16 URLA answers
  const CITIZENSHIP_TO_MISMO = {
    us_citizen: 'USCitizen',
    perm_resident: 'PermanentResidentAlien',
    non_perm: 'NonPermanentResidentAlien',
    foreign: 'ForeignNational',
  };
  const declArr = safeParseJsonArray(form1003.declarations_json);
  const ynOut = v => {
    const s = String(v || '').toLowerCase();
    if (s === 'yes') return 'true';
    if (s === 'no') return 'false';
    return null;
  };
  const declarationXml = (() => {
    const d0 = declArr[0] || {};
    const citizenship = form1003.citizenship ? CITIZENSHIP_TO_MISMO[form1003.citizenship] : null;
    // CRITICAL: MISMO 3.4 declares DECLARATION_DETAIL as an xs:sequence with
    // its children in ALPHABETICAL order. Emitting them in URLA question
    // order (A, A1, C, D1...) makes a strict validator reject the entire
    // block — which is exactly why Arive showed Declarations blank. Keep
    // this list alphabetical; the URLA letter is noted per line instead.
    const parts = [
      tag('BankruptcyIndicator', ynOut(d0.M)),                                   // M
      citizenship ? tag('CitizenshipResidencyType', citizenship) : '',
      // These two are Yes/No enums, not boolean indicators
      d0.A1 ? tag('HomeownerPastThreeYearsType', String(d0.A1).toLowerCase() === 'yes' ? 'Yes' : 'No') : '',  // A1
      d0.A ? tag('IntentToOccupyType', String(d0.A).toLowerCase() === 'yes' ? 'Yes' : 'No') : '',             // A
      tag('OutstandingJudgmentsIndicator', ynOut(d0.G)),                         // G
      tag('PartyToLawsuitIndicator', ynOut(d0.I)),                               // I
      tag('PresentlyDelinquentIndicator', ynOut(d0.H)),                          // H
      tag('PriorPropertyDeedInLieuConveyedIndicator', ynOut(d0.J)),              // J
      tag('PriorPropertyForeclosureCompletedIndicator', ynOut(d0.L)),            // L
      tag('PriorPropertyShortSaleCompletedIndicator', ynOut(d0.K)),              // K
      tag('PropertyProposedCleanEnergyLienIndicator', ynOut(d0.E)),              // E
      tag('UndisclosedBorrowedFundsIndicator', ynOut(d0.C)),                     // C
      tag('UndisclosedComakerOfNoteIndicator', ynOut(d0.F)),                     // F
      tag('UndisclosedCreditApplicationIndicator', ynOut(d0.D2)),                // D2
      tag('UndisclosedMortgageApplicationIndicator', ynOut(d0.D1)),              // D1
    ].filter(Boolean).join('\n                    ');
    const sellerRel = ynOut(d0.B);
    return parts || sellerRel ? `
                <DECLARATION>
                  <DECLARATION_DETAIL>
                    ${parts}${sellerRel ? `
                    <EXTENSION>
                      <OTHER>
                        <ULAD:DECLARATION_DETAIL_EXTENSION>
                          <ULAD:SpecialBorrowerSellerRelationshipIndicator>${esc(sellerRel)}</ULAD:SpecialBorrowerSellerRelationshipIndicator>
                        </ULAD:DECLARATION_DETAIL_EXTENSION>
                      </OTHER>
                    </EXTENSION>` : ''}
                  </DECLARATION_DETAIL>
                </DECLARATION>` : '';
  })();

  // GOVERNMENT_MONITORING — HMDA demographics
  const demoArr = safeParseJsonArray(form1003.demographics_json);
  const COLLECTION_TO_MISMO = {
    'Face-to-Face (incl. Electronic Media)': 'FaceToFace',
    'Telephone Interview': 'Telephone',
    'Fax or Mail': 'Mail',
    'Email or Internet': 'Internet',
  };
  const RACE_TO_MISMO = {
    White: 'White', BlackOrAfricanAmerican: 'BlackOrAfricanAmerican',
    AmericanIndian: 'AmericanIndianOrAlaskaNative', Asian: 'Asian',
    PacificIslander: 'NativeHawaiianOrOtherPacificIslander',
    'Asian Indian': 'AsianIndian', Chinese: 'Chinese', Filipino: 'Filipino',
    Vietnamese: 'Vietnamese', Korean: 'Korean', Japanese: 'Japanese',
    'Other Asian': 'OtherAsian', 'Native Hawaiian': 'NativeHawaiian',
    Samoan: 'Samoan', 'Guamanian or Chamorro': 'GuamanianOrChamorro',
    'Other Pacific Islander': 'OtherPacificIslander',
  };
  const ETHNICITY_TO_MISMO = {
    Mexican: 'Mexican', 'Puerto Rican': 'PuertoRican', Cuban: 'Cuban',
    'Other Hispanic or Latino': 'OtherHispanicOrLatino',
  };
  const govtMonitoringXml = (() => {
    const g = demoArr[0];
    if (!g || !Object.keys(g).length) return '';
    const races = (g.races || []).map(r => `
                    <HMDA_RACE>
                      <HMDA_RACE_DETAIL>
                        <HMDARaceType>${esc(RACE_TO_MISMO[r] || r)}</HMDARaceType>
                      </HMDA_RACE_DETAIL>
                    </HMDA_RACE>`).join('');
    const eths = (g.ethnicities || []).map(e => `
                    <HMDA_ETHNICITY_ORIGIN>
                      <HMDAEthnicityOriginType>${esc(ETHNICITY_TO_MISMO[e] || e)}</HMDAEthnicityOriginType>
                    </HMDA_ETHNICITY_ORIGIN>`).join('');
    const ethType = g.hispanic === true ? 'HispanicOrLatino'
                  : g.hispanic === false ? 'NotHispanicOrLatino' : null;
    return `
                <GOVERNMENT_MONITORING>
                  <GOVERNMENT_MONITORING_DETAIL>
                    ${tag('HMDAEthnicityRefusalIndicator', g.ethnicityRefused ? 'true' : 'false')}
                    ${tag('HMDAGenderRefusalIndicator', g.sexRefused ? 'true' : 'false')}
                    ${tag('HMDARaceRefusalIndicator', g.raceRefused ? 'true' : 'false')}
                    <EXTENSION>
                      <OTHER>
                        <ULAD:GOVERNMENT_MONITORING_DETAIL_EXTENSION>
                          ${g.sex ? `<ULAD:HMDAGenderType>${esc(g.sex)}</ULAD:HMDAGenderType>` : ''}
                          ${g.collectionMethod ? `<ULAD:ApplicationTakenMethodType>${esc(COLLECTION_TO_MISMO[g.collectionMethod] || g.collectionMethod)}</ULAD:ApplicationTakenMethodType>` : ''}
                        </ULAD:GOVERNMENT_MONITORING_DETAIL_EXTENSION>
                      </OTHER>
                    </EXTENSION>
                  </GOVERNMENT_MONITORING_DETAIL>${ethType ? `
                  <HMDA_ETHNICITIES>
                    <HMDA_ETHNICITY>
                      <HMDA_ETHNICITY_DETAIL>
                        <HMDAEthnicityType>${esc(ethType)}</HMDAEthnicityType>
                      </HMDA_ETHNICITY_DETAIL>
                    </HMDA_ETHNICITY>
                  </HMDA_ETHNICITIES>` : ''}${eths ? `
                  <HMDA_ETHNICITY_ORIGINS>${eths}
                  </HMDA_ETHNICITY_ORIGINS>` : ''}${races ? `
                  <HMDA_RACES>${races}
                  </HMDA_RACES>` : ''}
                </GOVERNMENT_MONITORING>`;
  })();

  // RESIDENCES — the borrower's current address + how they occupy it.
  // Arive reads occupancy ("Own"/"Rent") from here; without this block its
  // Current Address and Occupancy fields import blank.
  const residencesXml = (form1003.address_street || form1003.address_city) ? `
                <RESIDENCES>
                  <RESIDENCE>
                    <ADDRESS>
                      ${tag('AddressLineText', [form1003.address_num, form1003.address_street].filter(Boolean).join(' '))}
                      ${tag('CityName', form1003.address_city)}
                      <CountryCode>US</CountryCode>
                      ${tag('PostalCode', form1003.address_zip ? String(form1003.address_zip).replace(/\D/g,'') : null)}
                      ${tag('StateCode', stateCode(form1003.address_state))}
                    </ADDRESS>
                    <RESIDENCE_DETAIL>
                      <BorrowerResidencyBasisType>${esc(form1003.own_rent === 'Rent' ? 'Rent' : 'Own')}</BorrowerResidencyBasisType>
                      <BorrowerResidencyType>Current</BorrowerResidencyType>
                    </RESIDENCE_DETAIL>
                  </RESIDENCE>
                </RESIDENCES>` : '';

  const borrowerParties = [];

  if (hasPrimaryBorrower) {
    borrowerParties.push(`
        <PARTY SequenceNumber="1">
          <INDIVIDUAL>${contactPointsXml}
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
              <AddressType>Current</AddressType>
              ${tag('CityName', form1003.address_city)}
              <CountryCode>US</CountryCode>
              ${tag('PostalCode', form1003.address_zip)}
              ${tag('StateCode', stateCode(form1003.address_state))}
            </ADDRESS>
          </ADDRESSES>
          <ROLES>
            <ROLE SequenceNumber="1" xlink:label="BORROWER_1">
              <BORROWER>
                <BORROWER_DETAIL>
                  ${tag('BorrowerBirthDate', dateOnly(form1003.dob))}
                  <BorrowerClassificationType>Primary</BorrowerClassificationType>
                  ${tag('MaritalStatusType', form1003.marital_status)}
                </BORROWER_DETAIL>${counselingXml}
                <CURRENT_INCOME>
                  <CURRENT_INCOME_ITEMS>${incomeItemsXml}
                  </CURRENT_INCOME_ITEMS>
                </CURRENT_INCOME>${declarationXml}${employerXml}${govtMonitoringXml}${militaryServicesXml}${residencesXml}
              </BORROWER>
              <ROLE_DETAIL>
                <PartyRoleType>Borrower</PartyRoleType>
              </ROLE_DETAIL>
            </ROLE>
          </ROLES>${form1003.ssn ? `
          <TAXPAYER_IDENTIFIERS>
            <TAXPAYER_IDENTIFIER>
              <TaxpayerIdentifierType>SocialSecurityNumber</TaxpayerIdentifierType>
              ${tag('TaxpayerIdentifierValue', ssnDigits(form1003.ssn))}
            </TAXPAYER_IDENTIFIER>
          </TAXPAYER_IDENTIFIERS>` : ''}
        </PARTY>`);
  }

  for (const n of [2, 3, 4]) {
    const fn = form1003[`first_nm_borrower_${n}`];
    const ln = form1003[`last_nm_borrower_${n}`];
    if (!fn && !ln) continue;
    borrowerParties.push(`
        <PARTY SequenceNumber="${n}">
          <INDIVIDUAL>
            <NAME>
              ${tag('FirstName', fn)}
              ${tag('LastName', ln)}
              ${tag('FullName', [fn, ln].filter(Boolean).join(' '))}
            </NAME>
          </INDIVIDUAL>
          <ROLES>
            <ROLE SequenceNumber="1" xlink:label="BORROWER_${n}">
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

  // ---- LIABILITIES (linked to BORROWER_1 via RELATIONSHIPS — Jammie's
  // liabilities_json doesn't track per-borrower ownership, so every
  // liability is attributed to the primary borrower rather than guessed) ----
  let liabCounter = 0;
  const liabilityXml = liabilities.map(l => {
    liabCounter++;
    const label = `LIABILITY_${liabCounter}`;
    if (hasPrimaryBorrower) {
      relationships.push({ from: label, to: 'BORROWER_1', arcrole: 'LIABILITY_IsAssociatedWith_ROLE' });
    }
    return `
        <LIABILITY SequenceNumber="${liabCounter}" xlink:label="${label}">
          <LIABILITY_DETAIL>
            ${tag('LiabilityMonthlyPaymentAmount', money(l.monthly_payment ?? l.payment))}
            ${tag('LiabilityType', l.type || 'Other')}
            ${tag('LiabilityUnpaidBalanceAmount', money(l.balance ?? l.unpaid_balance))}
          </LIABILITY_DETAIL>${l.creditor ? `
          <LIABILITY_HOLDER><NAME>${tag('FullName', l.creditor)}</NAME></LIABILITY_HOLDER>` : ''}
        </LIABILITY>`;
  }).join('');

  const liabilitiesXml = liabilityXml ? `
      <LIABILITIES>${liabilityXml}
      </LIABILITIES>` : '';

  // ---- ASSETS (new — Jammie already captures this in assets_json, it
  // just wasn't wired into the export before now) ----
  let assetCounter = 0;
  const assetXml = assets.map(a => {
    assetCounter++;
    const label = `ASSET_${assetCounter}`;
    if (hasPrimaryBorrower) {
      // ASSET_IsAssociatedWith_ROLE mirrors LIABILITY_IsAssociatedWith_ROLE
      // (standard MISMO 3.4 arcrole naming convention) — not directly
      // confirmed against a real sample since the comparison files
      // didn't include an ASSETS section, but follows the same pattern
      // MISMO uses consistently elsewhere in this file.
      relationships.push({ from: label, to: 'BORROWER_1', arcrole: 'ASSET_IsAssociatedWith_ROLE' });
    }
    return `
        <ASSET SequenceNumber="${assetCounter}" xlink:label="${label}">
          <ASSET_DETAIL>
            <AssetType>${esc(assetType(a.type))}</AssetType>
            ${tag('AssetCashOrMarketValueAmount', money(a.value))}
            ${tag('AssetAccountIdentifier', a.acct)}
          </ASSET_DETAIL>${a.depositor ? `
          <ASSET_HOLDER><NAME>${tag('FullName', a.depositor)}</NAME></ASSET_HOLDER>` : ''}
        </ASSET>`;
  }).join('');

  // ---- REAL ESTATE OWNED ----
  // OWNED_PROPERTY nests inside ASSETS/ASSET — verified against real Arive
  // exports. Emitted as its own ASSET entry so it round-trips back through
  // the import path, which reads the same location.
  const reos = safeParseJsonArray(form1003.reos_json);
  const OCCUPANCY_TO_MISMO_REO = { 'Primary Residence':'PrimaryResidence', 'Second Home':'SecondHome', 'Investment':'Investment' };
  const reoXml = reos.map(r => {
    assetCounter++;
    const zipDigits = r.zip ? String(r.zip).replace(/\D/g, '') : null;
    return `
        <ASSET SequenceNumber="${assetCounter}" xlink:label="ASSET_${assetCounter}">
          <OWNED_PROPERTY>
            <OWNED_PROPERTY_DETAIL>
              ${tag('OwnedPropertyDispositionStatusType', r.status)}
              ${tag('OwnedPropertyLienUPBAmount', money(r.lienAmount))}
              ${tag('OwnedPropertySubjectIndicator', r.isSubject ? 'true' : 'false')}
            </OWNED_PROPERTY_DETAIL>
            <PROPERTY>
              <ADDRESS>
                ${tag('AddressLineText', r.addr1)}
                ${tag('CityName', r.city)}
                <CountryCode>US</CountryCode>
                ${tag('PostalCode', zipDigits)}
                ${tag('StateCode', stateCode(r.state))}
              </ADDRESS>
              <PROPERTY_DETAIL>
                ${tag('PropertyEstimatedValueAmount', money(r.marketValue))}
                ${r.occupancy ? tag('PropertyUsageType', OCCUPANCY_TO_MISMO_REO[r.occupancy] || r.occupancy) : ''}
              </PROPERTY_DETAIL>
            </PROPERTY>
          </OWNED_PROPERTY>
        </ASSET>`;
  }).join('');

  const assetsXml = (assetXml || reoXml) ? `
      <ASSETS>${assetXml}${reoXml}
      </ASSETS>` : '';

  // ---- RELATIONSHIPS (discrepancy #6) ----
  const relationshipsXml = relationships.length ? `
      <RELATIONSHIPS>${relationships.map((r, i) => `
        <RELATIONSHIP SequenceNumber="${i + 1}" xlink:from="${r.from}" xlink:to="${r.to}" xlink:arcrole="urn:fdc:mismo.org:2009:residential/${r.arcrole}"/>`).join('')}
      </RELATIONSHIPS>` : '';

  // ---- ROOT — namespaces confirmed against a real DU/Arive export
  // (discrepancy #2), JAMMIE extension now uses its own prefix instead
  // of redefining the default namespace (discrepancy #8) ----
  return `<?xml version="1.0"?>
<MESSAGE MISMOReferenceModelIdentifier="3.4.032420160128" xmlns="${MISMO_NS}" xmlns:DU="${DU_NS}" xmlns:ULAD="${ULAD_NS}" xmlns:xlink="${XLINK_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:JAMMIE="${JAMMIE_NS}">
  <ABOUT_VERSIONS>
    <ABOUT_VERSION>
      <CreatedDatetime>${new Date().toISOString()}</CreatedDatetime>
    </ABOUT_VERSION>
  </ABOUT_VERSIONS>
  <DEAL_SETS>
    <DEAL_SET>
      <DEALS>
        <DEAL>${assetsXml}${collateralXml}${liabilitiesXml}${loanXml}${partiesXml}${relationshipsXml}
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
  removeNSPrefix: true,   // strips MISMO:/DU:/ULAD:/JAMMIE: prefixes so we
                          // can match plain tag names regardless of the
                          // source namespace. xlink:label/from/to attributes
                          // are irrelevant to import (we only read element
                          // text content), so this has no effect on parsing.
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
    if (Array.isArray(cur)) cur = cur[0];
    cur = cur[keys[i]];
  }
  return cur;
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
    const purposeType = dig(loanNode, 'TERMS_OF_LOAN.LoanPurposeType');
    const cashOutDet = dig(loanNode, 'REFINANCE.RefinanceCashOutDeterminationType');
    // Real Arive exports send LoanPurposeType="Refinance" (plain) and put the
    // cash-out detail in REFINANCE/RefinanceCashOutDeterminationType. Older
    // code only recognized the combined "CashOutRefinance"/"NoCashOutRefinance"
    // values, which Arive never emits — so Refinance Type imported blank.
    // Values map to Jammie's own dropdown labels (Arive uses the same three).
    if (purposeType === 'Refinance' || purposeType === 'CashOutRefinance' || purposeType === 'NoCashOutRefinance') {
      if (purposeType === 'CashOutRefinance' || cashOutDet === 'CashOut') {
        loan.refi_type = 'Cash-Out';
      } else if (cashOutDet === 'LimitedCashOut') {
        loan.refi_type = 'Limited Cash-Out';
      } else {
        loan.refi_type = 'Rate & Term';
      }
    } else if (purposeType === 'Purchase') {
      loan.refi_type = null;
    }
    const refiPurpose = dig(loanNode, 'REFINANCE.RefinancePrimaryPurposeType');
    if (refiPurpose) loan.cash_out_purpose = refiPurpose;
    const existingLiens = num(dig(loanNode, 'REFINANCE.RefinanceExistingLiensAmount'));
    if (existingLiens !== null) loan.existing_liens_amount = existingLiens;
    const refiProgram = dig(loanNode, 'REFINANCE.RefinanceProgramIdentifier');
    if (refiProgram) loan.refinance_program = refiProgram;
  }
  // Collected here, applied to form1003 further down (form1003 isn't
  // declared yet at this point in the function).
  const propertyFields = {};
  if (collateral) {
    loan.subject_property = dig(collateral, 'ADDRESS.AddressLineText') || undefined;
    // Purchase price and appraised value are DISTINCT values in real Arive
    // exports (e.g. $374,000 price vs $355,300 loan = 95% LTV). Jammie
    // previously had neither, and the frontend defaulted appraised value to
    // the loan amount, which wrongly produced 100% LTV on every import.
    loan.sales_price = num(dig(collateral, 'SALES_CONTRACTS.SALES_CONTRACT.SALES_CONTRACT_DETAIL.SalesContractAmount'));
    loan.appraised_value = num(
      dig(collateral, 'PROPERTY_VALUATIONS.PROPERTY_VALUATION.PROPERTY_VALUATION_DETAIL.PropertyValuationAmount')
      ?? dig(collateral, 'PROPERTY_DETAIL.PropertyEstimatedValueAmount')
    );

    // PropertyExistingLienAmount is the real MISMO field for this and
    // matches what Arive displays exactly ($193,999). Previously this was
    // derived from the mortgage liability balance ($193,626), which was
    // close but not the same number. Overrides the derived value below.
    const propExistingLien = num(dig(collateral, 'PROPERTY_DETAIL.PropertyExistingLienAmount'));
    if (propExistingLien !== null) loan.existing_liens_amount = propExistingLien;

    // ── Subject property address + detail ──
    propertyFields.sp_addr1  = dig(collateral, 'ADDRESS.AddressLineText') || undefined;
    propertyFields.sp_unit   = dig(collateral, 'ADDRESS.AddressUnitIdentifier') || undefined;
    propertyFields.sp_city   = dig(collateral, 'ADDRESS.CityName') || undefined;
    propertyFields.sp_state  = stateNameFromCode(dig(collateral, 'ADDRESS.StateCode')) || undefined;
    // MISMO sends "Cherokee County"; Arive's county field shows just
    // "Cherokee" (the word "County" is implied by the field label).
    const rawCounty = dig(collateral, 'ADDRESS.CountyName');
    if (rawCounty) propertyFields.sp_county = String(rawCounty).replace(/\s+County$/i, '').trim();
    // ZIPs arrive unformatted (e.g. "301884676") — render as ZIP+4 so it
    // matches Arive's display ("30188-4676"). Kept as a string throughout
    // so leading zeros survive.
    const rawZip = dig(collateral, 'ADDRESS.PostalCode');
    if (rawZip) {
      const z = String(rawZip).replace(/\D/g, '');
      propertyFields.sp_zip = z.length === 9 ? `${z.slice(0,5)}-${z.slice(5)}` : z;
    }

    propertyFields.num_units = num(dig(collateral, 'PROPERTY_DETAIL.FinancedUnitCount')) ?? undefined;

    const attach = dig(collateral, 'PROPERTY_DETAIL.AttachmentType');
    if (attach) propertyFields.attachment_type = attach;

    // MISMO uses CamelCase enums; Jammie's dropdowns use spaced labels.
    const CONSTRUCTION_MAP = { SiteBuilt:'Site Built', Manufactured:'Manufactured', Modular:'Modular', OnFrameModular:'On Frame Modular' };
    const constr = dig(collateral, 'PROPERTY_DETAIL.ConstructionMethodType');
    if (constr) propertyFields.construction_method = CONSTRUCTION_MAP[constr] || constr;

    const OCCUPANCY_MAP = { PrimaryResidence:'Primary Residence', SecondHome:'Second Home', Investment:'Investment', Investor:'Investment' };
    const usage = dig(collateral, 'PROPERTY_DETAIL.PropertyUsageType');
    if (usage) propertyFields.occupancy = OCCUPANCY_MAP[usage] || usage;

    const ESTATE_MAP = { FeeSimple:'Fee Simple', Leasehold:'Leasehold' };
    const estate = dig(collateral, 'PROPERTY_DETAIL.PropertyEstateType');
    if (estate) propertyFields.property_rights = ESTATE_MAP[estate] || estate;

    // Property type isn't a single MISMO element — derive from unit count
    // and project indicators, which is the best signal the file gives.
    const units = num(dig(collateral, 'PROPERTY_DETAIL.FinancedUnitCount')) || 1;
    const inProject = String(dig(collateral, 'PROPERTY_DETAIL.PropertyInProjectIndicator')) === 'true';
    const isPUD = String(dig(collateral, 'PROPERTY_DETAIL.PUDIndicator')) === 'true';
    propertyFields.prop_type = inProject ? 'Condominium' : isPUD ? 'PUD' : units > 1 ? '2-4 Unit' : 'Single Family (1-4 Units)';

    // NOTE: year_built, year_acquired, acreage and orig_cost are NOT
    // present anywhere in real Arive MISMO exports (verified) — they stay
    // manual-entry-only. Same for manner_title / title_held_in, which have
    // no MISMO counterpart in these files.
  }

  // HOUSING_EXPENSES carries the Proposed Monthly Payment breakdown that
  // Arive shows (P&I, MI, HOI, taxes...). Jammie already had matching
  // pmt_* columns — they just were never populated from the file.
  // Only "Proposed" timing rows are used; files may also carry "Present"
  // (current housing expense) rows, which are a different thing entirely.
  // ── CLOSING COST SUMMARY TOTALS ──
  // The itemized A–H fee lines are NOT in Arive's MISMO export (verified:
  // no FEES/FEE/INTEGRATED_DISCLOSURE/ESCROW_ITEMS sections exist), but
  // these four summary figures ARE, and they reconcile exactly to Arive:
  //   8210.95 + 4565.83 - 322.08 = 12,454.70  (Total Closing Costs)
  //   244,000 - 12,454.70 - 3,334 = 228,211.30 (Cash to Borrower)
  const closingInfo = dig(deal, 'LOANS.LOAN.CLOSING_INFORMATION');
  if (closingInfo) {
    const cashToBorrower = num(dig(closingInfo, 'CLOSING_INFORMATION_DETAIL.CashToBorrowerAtClosingAmount'));
    if (cashToBorrower !== null) loan.cash_to_borrower = cashToBorrower;

    // Lender credits arrive as CLOSING_ADJUSTMENT_ITEMs; pick the one
    // typed LenderCredit (there may be several adjustment types).
    let adjItems = dig(closingInfo, 'CLOSING_ADJUSTMENT_ITEMS.CLOSING_ADJUSTMENT_ITEM');
    if (adjItems && !Array.isArray(adjItems)) adjItems = [adjItems];
    (adjItems || []).forEach(item => {
      const type = dig(item, 'CLOSING_ADJUSTMENT_ITEM_DETAIL.ClosingAdjustmentItemType');
      const amt = num(dig(item, 'CLOSING_ADJUSTMENT_ITEM_DETAIL.ClosingAdjustmentItemAmount'));
      if (type === 'LenderCredit' && amt !== null) loan.lender_credit_amount = amt;
    });
  }
  // Both live under the URLA document data set, not at LOAN level
  // (verified against the real export).
  const urlaDetail = dig(loanNode, 'DOCUMENT_SPECIFIC_DATA_SETS.DOCUMENT_SPECIFIC_DATA_SET.URLA.URLA_DETAIL');
  const estClosing = num(dig(urlaDetail, 'EstimatedClosingCostsAmount'));
  if (estClosing !== null) loan.estimated_closing_costs = estClosing;
  const prepaidItems = num(dig(urlaDetail, 'PrepaidItemsEstimatedAmount'));
  if (prepaidItems !== null) loan.prepaid_items_estimated = prepaidItems;

  let housingExpenses = dig(loanNode, 'HOUSING_EXPENSES.HOUSING_EXPENSE');
  if (housingExpenses && !Array.isArray(housingExpenses)) housingExpenses = [housingExpenses];
  const HOUSING_EXPENSE_MAP = {
    FirstMortgagePrincipalAndInterest: 'pmt_first_mortgage',
    MIPremium: 'pmt_mi',
    HomeownersInsurance: 'pmt_hoi',
    RealEstateTax: 'pmt_property_taxes',
    HomeownersAssociationDuesAndCondominiumFees: 'pmt_association_dues',
    SupplementalPropertyInsurance: 'pmt_supplemental',
    OtherHousingExpense: 'pmt_other',
  };
  (housingExpenses || []).forEach(he => {
    if (dig(he, 'HousingExpenseTimingType') !== 'Proposed') return;
    const col = HOUSING_EXPENSE_MAP[dig(he, 'HousingExpenseType')];
    const amt = num(dig(he, 'HousingExpensePaymentAmount'));
    if (col && amt !== null) loan[col] = amt;
  });
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

    // ── Email + phones from CONTACT_POINTS ──
    // Each CONTACT_POINT holds EITHER an email OR a phone, with the phone's
    // purpose in CONTACT_POINT_DETAIL.ContactPointRoleType (Mobile/Home/Work).
    // Both were present in the file all along but never mapped, which is why
    // the Email field stayed blank after every import.
    let contactPoints = dig(primary, 'INDIVIDUAL.CONTACT_POINTS.CONTACT_POINT');
    if (contactPoints && !Array.isArray(contactPoints)) contactPoints = [contactPoints];
    (contactPoints || []).forEach(cp => {
      const email = dig(cp, 'CONTACT_POINT_EMAIL.ContactPointEmailValue');
      if (email && !form1003.email) form1003.email = email;
      const phone = dig(cp, 'CONTACT_POINT_TELEPHONE.ContactPointTelephoneValue');
      const role = dig(cp, 'CONTACT_POINT_DETAIL.ContactPointRoleType');
      if (phone) {
        const digits = String(phone).replace(/\D/g, '');
        // Format as (XXX) XXX-XXXX to match how Arive displays it
        const pretty = digits.length === 10
          ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
          : String(phone);
        if (role === 'Mobile' && !form1003.cell_phone) form1003.cell_phone = pretty;
        else if (role === 'Home' && !form1003.phone) form1003.phone = pretty;
      }
    });
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
    // Was entirely unmapped — every import defaulted to U.S. Citizen
    // regardless of the file's actual value. Jammie's radio buttons use
    // short codes, not MISMO's CamelCase enum.
    // How the borrower occupies their CURRENT address (Own/Rent) —
    // distinct from the subject property's occupancy.
    const residencyBasis = dig(primary, 'ROLES.ROLE.BORROWER.RESIDENCES.RESIDENCE.RESIDENCE_DETAIL.BorrowerResidencyBasisType');
    if (residencyBasis) form1003.own_rent = residencyBasis === 'Rent' ? 'Rent' : residencyBasis === 'LiveRentFree' ? 'Live Rent Free' : 'Own';

    const citizenshipType = dig(primary, 'ROLES.ROLE.BORROWER.DECLARATION.DECLARATION_DETAIL.CitizenshipResidencyType');
    const CITIZENSHIP_MAP = {
      USCitizen: 'us_citizen',
      PermanentResidentAlien: 'perm_resident',
      NonPermanentResidentAlien: 'non_perm',
      ForeignNational: 'foreign',
    };
    if (citizenshipType && CITIZENSHIP_MAP[citizenshipType]) {
      form1003.citizenship = CITIZENSHIP_MAP[citizenshipType];
    }
    // Accepts SSN with or without hyphens from the source file — always
    // normalized to Jammie's own XXX-XX-XXXX display format.
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
    let sawIncomeItem = false;
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
      if (map[t]) { form1003[map[t]] = amt; sawIncomeItem = true; }
    });

    // Self-employed borrowers: Arive emits NO CURRENT_INCOME_ITEM elements
    // at all — the monthly figure lives in EMPLOYMENT/EmploymentMonthlyIncomeAmount
    // instead. Without this, a self-employed borrower imports with $0 income.
    // Only used as a fallback so we never double-count a W-2 borrower who
    // has both.
    const selfEmpIndicator = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.EMPLOYMENT.EmploymentBorrowerSelfEmployedIndicator');
    const employmentMonthly = num(dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.EMPLOYMENT.EmploymentMonthlyIncomeAmount'));
    if (!sawIncomeItem && employmentMonthly !== null) {
      form1003.gross_income_monthly_base = employmentMonthly;
    }
    if (selfEmpIndicator !== undefined && selfEmpIndicator !== null) {
      form1003.self_employed = String(selfEmpIndicator) === 'true' ? 1 : 0;
    }
    const ownershipInterest = dig(primary, 'ROLES.ROLE.BORROWER.EMPLOYERS.EMPLOYER.EMPLOYMENT.OwnershipInterestType');
    if (ownershipInterest) form1003.ownership_interest = ownershipInterest;

    // Write incomes_json directly (matching the shape App.jsx's income
    // array expects) rather than relying solely on the frontend rebuilding
    // it from the legacy gross_income_monthly_* columns — belt and
    // suspenders, and consistent with how liabilities_json/reos_json are
    // already handled below.
    if (form1003.gross_income_monthly_base || form1003.gross_income_monthly_overtime
        || form1003.gross_income_monthly_bonus || form1003.gross_income_monthly_commission
        || form1003.gross_income_monthly_other) {
      form1003.incomes_json = JSON.stringify([{
        id: Date.now(), borrower: 'Borrower', type: 'Employment Income',
        employer: form1003.employee_or_business_nm || '',
        position: form1003.position_title || '',
        startDate: form1003.position_start_date || '',
        base: form1003.gross_income_monthly_base || '',
        overtime: form1003.gross_income_monthly_overtime || '',
        bonuses: form1003.gross_income_monthly_bonus || '',
        commission: form1003.gross_income_monthly_commission || '',
        otherW2: form1003.gross_income_monthly_other || '',
        currentEmp: true, primary: true,
        selfEmp: form1003.self_employed === 1,
        familyRelated: false,
        addr1: '', city: '', state: '', zip: '', country: 'United States',
        phone: '', verPhone: '', verEmail: '', endDate: '', tips: '', seasonal: '',
      }]);
    }
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

  // Merge in the subject-property fields gathered from COLLATERAL above.
  Object.assign(form1003, propertyFields);

  // ── DECLARATIONS (all 16 URLA answers, per borrower) ──
  // Stored as a JSON array indexed by borrower, mirroring how the
  // frontend's `declarations` state is shaped.
  // MISMO uses a mix of true/false indicators and Yes/No enums; both are
  // normalized to the 'Yes'/'No' strings the UI radio buttons expect.
  const yn = v => {
    if (v === undefined || v === null || v === '') return '';
    const s = String(v).toLowerCase();
    // Lowercase to match the YNRow radio component's comparison
    if (s === 'true' || s === 'yes') return 'yes';
    if (s === 'false' || s === 'no') return 'no';
    return '';
  };
  const declarations = borrowerParties.map(p => {
    const dd = dig(p, 'ROLES.ROLE.BORROWER.DECLARATION.DECLARATION_DETAIL');
    if (!dd) return {};
    return {
      A:  yn(dig(dd, 'IntentToOccupyType')),
      A1: yn(dig(dd, 'HomeownerPastThreeYearsType')),
      B:  yn(dig(dd, 'EXTENSION.OTHER.DECLARATION_DETAIL_EXTENSION.SpecialBorrowerSellerRelationshipIndicator')),
      C:  yn(dig(dd, 'UndisclosedBorrowedFundsIndicator')),
      D1: yn(dig(dd, 'UndisclosedMortgageApplicationIndicator')),
      D2: yn(dig(dd, 'UndisclosedCreditApplicationIndicator')),
      E:  yn(dig(dd, 'PropertyProposedCleanEnergyLienIndicator')),
      F:  yn(dig(dd, 'UndisclosedComakerOfNoteIndicator')),
      G:  yn(dig(dd, 'OutstandingJudgmentsIndicator')),
      H:  yn(dig(dd, 'PresentlyDelinquentIndicator')),
      I:  yn(dig(dd, 'PartyToLawsuitIndicator')),
      J:  yn(dig(dd, 'PriorPropertyDeedInLieuConveyedIndicator')),
      K:  yn(dig(dd, 'PriorPropertyShortSaleCompletedIndicator')),
      L:  yn(dig(dd, 'PriorPropertyForeclosureCompletedIndicator')),
      M:  yn(dig(dd, 'BankruptcyIndicator')),
    };
  });
  if (declarations.some(d => Object.keys(d).length)) {
    form1003.declarations_json = JSON.stringify(declarations);
  }

  // ── DEMOGRAPHICS (HMDA ethnicity / sex / race / collection method) ──
  const COLLECTION_MAP = {
    FaceToFace: 'Face-to-Face (incl. Electronic Media)',
    Telephone: 'Telephone Interview',
    Mail: 'Fax or Mail',
    Internet: 'Email or Internet',
    Email: 'Email or Internet',
  };
  const demographics = borrowerParties.map(p => {
    const gm = dig(p, 'ROLES.ROLE.BORROWER.GOVERNMENT_MONITORING');
    if (!gm) return {};
    const gmd = dig(gm, 'GOVERNMENT_MONITORING_DETAIL');
    const ext = dig(gmd, 'EXTENSION.OTHER.GOVERNMENT_MONITORING_DETAIL_EXTENSION');

    let races = dig(gm, 'HMDA_RACES.HMDA_RACE');
    if (races && !Array.isArray(races)) races = [races];
    const raceList = (races || [])
      .map(r => dig(r, 'HMDA_RACE_DETAIL.HMDARaceType'))
      .filter(Boolean);

    let ethnicities = dig(gm, 'HMDA_ETHNICITY_ORIGINS.HMDA_ETHNICITY_ORIGIN');
    if (ethnicities && !Array.isArray(ethnicities)) ethnicities = [ethnicities];
    const ethList = (ethnicities || [])
      .map(e => dig(e, 'HMDAEthnicityOriginType'))
      .filter(Boolean);

    // Map MISMO's race enums to the keys the demographics checkboxes use.
    const RACE_MAP = {
      White: 'White',
      BlackOrAfricanAmerican: 'BlackOrAfricanAmerican',
      AmericanIndianOrAlaskaNative: 'AmericanIndian',
      Asian: 'Asian',
      NativeHawaiianOrOtherPacificIslander: 'PacificIslander',
      AsianIndian: 'Asian Indian', Chinese: 'Chinese', Filipino: 'Filipino',
      Vietnamese: 'Vietnamese', Korean: 'Korean', Japanese: 'Japanese',
      OtherAsian: 'Other Asian', NativeHawaiian: 'Native Hawaiian',
      Samoan: 'Samoan', GuamanianOrChamorro: 'Guamanian or Chamorro',
      OtherPacificIslander: 'Other Pacific Islander',
    };
    const ETHNICITY_MAP = {
      Mexican: 'Mexican', PuertoRican: 'Puerto Rican', Cuban: 'Cuban',
      OtherHispanicOrLatino: 'Other Hispanic or Latino',
    };
    const mappedRaces = raceList.map(r => RACE_MAP[r] || r);
    const mappedEth = ethList.map(e => ETHNICITY_MAP[e] || e);
    // HMDAEthnicityType (Hispanic vs Not) lives alongside the origin list
    const ethType = dig(gm, 'HMDA_ETHNICITIES.HMDA_ETHNICITY.HMDA_ETHNICITY_DETAIL.HMDAEthnicityType');

    return {
      collectionMethod: COLLECTION_MAP[dig(ext, 'ApplicationTakenMethodType')] || '',
      sex: dig(ext, 'HMDAGenderType') || '',
      sexRefused: String(dig(gmd, 'HMDAGenderRefusalIndicator')) === 'true',
      ethnicityRefused: String(dig(gmd, 'HMDAEthnicityRefusalIndicator')) === 'true',
      raceRefused: String(dig(gmd, 'HMDARaceRefusalIndicator')) === 'true',
      hispanic: ethType === 'HispanicOrLatino' ? true
              : ethType === 'NotHispanicOrLatino' ? false : undefined,
      races: mappedRaces,
      ethnicities: mappedEth,
    };
  });
  if (demographics.some(d => Object.keys(d).length)) {
    form1003.demographics_json = JSON.stringify(demographics);
  }

  let liabNodes = dig(deal, 'LIABILITIES.LIABILITY');
  if (liabNodes && !Array.isArray(liabNodes)) liabNodes = [liabNodes];
  if (liabNodes && liabNodes.length) {
    const parsedLiabs = liabNodes.map(l => ({
      type: dig(l, 'LIABILITY_DETAIL.LiabilityType') || 'Other',
      balance: num(dig(l, 'LIABILITY_DETAIL.LiabilityUnpaidBalanceAmount')),
      // Arive's per-liability monthly payment — previously unmapped, which
      // is why every liability imported with a $0.00 payment.
      payment: num(dig(l, 'LIABILITY_DETAIL.LiabilityMonthlyPaymentAmount')),
      monthly_payment: num(dig(l, 'LIABILITY_DETAIL.LiabilityMonthlyPaymentAmount')),
      acct: dig(l, 'LIABILITY_DETAIL.LiabilityAccountIdentifier') || '',
      // Drives Arive's "PAID OFF" badge
      paid_off: String(dig(l, 'LIABILITY_DETAIL.LiabilityPayoffStatusIndicator')) === 'true',
      // Excluded liabilities don't count toward DTI
      dti: String(dig(l, 'LIABILITY_DETAIL.LiabilityExclusionIndicator')) === 'true' ? 'Exclude' : 'Include',
      creditor: dig(l, 'LIABILITY_HOLDER.NAME.FullName') || null,
    }));
    form1003.liabilities_json = JSON.stringify(parsedLiabs);

    // Existing Liens Amount isn't its own MISMO element — derive it from the
    // subject property's mortgage liability balance (per product decision),
    // falling back to OwnedPropertyLienUPBAmount when present.
    if (loan.refi_type) {
      const mortgage = parsedLiabs.find(l => /mortgage/i.test(l.type || ''));
      const ownedLienUPB = num(dig(deal, 'ASSETS.ASSET.OWNED_PROPERTY.OWNED_PROPERTY_DETAIL.OwnedPropertyLienUPBAmount'));
      const derived = (mortgage && mortgage.balance) ?? ownedLienUPB;
      // Fallback only — PropertyExistingLienAmount (set above from
      // COLLATERAL) is the authoritative value when present.
      if (derived != null && loan.existing_liens_amount == null) loan.existing_liens_amount = derived;
    }
    // "Estimated Total Payoffs and Payments" — Arive shows $3,334.00 for
    // this loan, which is the sum of the paid-off liabilities' balances.
    // Not a MISMO element, so derived here the same way Arive does it.
    const payoffTotal = parsedLiabs
      .filter(l => l.paid_off)
      .reduce((a, l) => a + (Number(l.balance) || 0), 0);
    if (payoffTotal > 0) {
      loan.total_payoffs = Number(payoffTotal.toFixed(2));
    }
  }

  // ASSETS — new, mirrors the LIABILITIES parsing above. Maps back to
  // Jammie's own asset category labels so the Financial Info tab
  // recognizes them (rather than leaving MISMO's AssetType enum values
  // sitting unrecognized in the UI).
  const ASSET_TYPE_TO_JAMMIE = {
    CheckingAccount: 'Checking Account',
    SavingsAccount: 'Savings Account',
    Retirement: 'Retirement (401k/IRA)',
    Stock: 'Stocks / Bonds / Mutual Funds',
  };
  let assetNodes = dig(deal, 'ASSETS.ASSET');
  if (assetNodes && !Array.isArray(assetNodes)) assetNodes = [assetNodes];
  if (assetNodes && assetNodes.length) {
    form1003.assets_json = JSON.stringify(assetNodes.map(a => {
      const mismoType = dig(a, 'ASSET_DETAIL.AssetType');
      return {
        type: ASSET_TYPE_TO_JAMMIE[mismoType] || 'Other Assets',
        value: num(dig(a, 'ASSET_DETAIL.AssetCashOrMarketValueAmount')),
        acct: dig(a, 'ASSET_DETAIL.AssetAccountIdentifier') || '',
        depositor: dig(a, 'ASSET_HOLDER.NAME.FullName') || '',
      };
    }));
  }

  // ---- REAL ESTATE OWNED ----
  // OWNED_PROPERTY is nested inside ASSETS/ASSET (verified against a real
  // Arive export — it is NOT under the borrower's residences, which is
  // where MISMO docs might lead you to look).
  let assetNodesForReo = dig(deal, 'ASSETS.ASSET');
  if (assetNodesForReo && !Array.isArray(assetNodesForReo)) assetNodesForReo = [assetNodesForReo];
  const reos = [];
  (assetNodesForReo || []).forEach((a, i) => {
    let owned = dig(a, 'OWNED_PROPERTY');
    if (!owned) return;
    if (!Array.isArray(owned)) owned = [owned];
    owned.forEach((o, j) => {
      const addr = dig(o, 'PROPERTY.ADDRESS.AddressLineText');
      const value = num(dig(o, 'PROPERTY.PROPERTY_DETAIL.PropertyEstimatedValueAmount'));
      if (!addr && value === null) return;
      reos.push({
        id: `reo_${i}_${j}`,
        isSubject: String(dig(o, 'OWNED_PROPERTY_DETAIL.OwnedPropertySubjectIndicator')) === 'true',
        addr1: addr || '',
        city: dig(o, 'PROPERTY.ADDRESS.CityName') || '',
        state: stateNameFromCode(dig(o, 'PROPERTY.ADDRESS.StateCode')) || '',
        zip: dig(o, 'PROPERTY.ADDRESS.PostalCode') || '',
        occupancy: dig(o, 'PROPERTY.PROPERTY_DETAIL.PropertyUsageType') === 'PrimaryResidence'
          ? 'Primary Residence'
          : (dig(o, 'PROPERTY.PROPERTY_DETAIL.PropertyUsageType') || ''),
        marketValue: value,
        propType: '',
        status: dig(o, 'OWNED_PROPERTY_DETAIL.OwnedPropertyDispositionStatusType') || '',
        lienAmount: num(dig(o, 'OWNED_PROPERTY_DETAIL.OwnedPropertyLienUPBAmount')),
      });
    });
  });
  if (reos.length) form1003.reos_json = JSON.stringify(reos);

  Object.keys(form1003).forEach(k => (form1003[k] === undefined || form1003[k] === null) && delete form1003[k]);

  return { loan, form1003 };
}

module.exports = { buildMismoXml, parseMismoXml };
