// src/borrower/steps.js — the borrower application, as data.
//
// One STEPS list drives both layouts (desktop nav + phone stepper). Each
// step says which part of the form it edits ('shared' | 'borrower' | a list
// name | 'declarations' | 'demographics' | 'review') and lists its fields.
// Field keys are the database column / JSON entry keys the API accepts
// (server/lib/apply-fields.cjs), so there is no mapping layer to drift.
//
// Phase 5 wraps every label below in t(); keep them as plain strings.

export const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','DC'];

const isPurchase = f => (f.shared?.purpose || 'Purchase Home') !== 'Refinance';
const isRefi     = f => f.shared?.purpose === 'Refinance';

// ── per-step field definitions ──────────────────────────────────────────
// type: text | email | phone | ssn | date | money | number | select | state |
//       zip | yesno | checkbox | radio | textarea
// req: required for the step to count as done
// showIf(form): hide when false
// span: 2 → full width on desktop

const LOAN_FIELDS = [
  { key: 'purpose', label: 'What is this loan for?', type: 'radio', req: true, span: 2,
    options: [['Purchase Home', 'Buying a home'], ['Refinance', 'Refinancing a home I own']] },
  { key: '_hasProperty', label: 'Have you chosen the property?', type: 'radio', span: 2, showIf: isPurchase,
    options: [['yes', 'Yes, I have an address'], ['no', 'Not yet — I am getting pre-approved']], virtual: true },
  { key: 'sp_addr1', label: 'Property street address', type: 'text', span: 2, showIf: f => isRefi(f) || f._hasProperty === 'yes' },
  { key: 'sp_unit',  label: 'Unit #', type: 'text', showIf: f => isRefi(f) || f._hasProperty === 'yes' },
  { key: 'sp_city',  label: 'City', type: 'text', showIf: f => isRefi(f) || f._hasProperty === 'yes' },
  { key: 'sp_state', label: 'State', type: 'state', showIf: f => isRefi(f) || f._hasProperty === 'yes' },
  { key: 'sp_zip',   label: 'ZIP code', type: 'zip', showIf: f => isRefi(f) || f._hasProperty === 'yes' },
  { key: 'sp_county', label: 'County', type: 'text', showIf: f => isRefi(f) || f._hasProperty === 'yes' },
  { key: 'sales_price', label: 'Purchase price', type: 'money', req: true, showIf: isPurchase, hint: 'Agreed price, or the price range you are shopping in' },
  { key: 'down_payment', label: 'Down payment', type: 'money', showIf: isPurchase },
  { key: 'appraised_value', label: 'Estimated value of the home', type: 'money', req: true, showIf: isRefi },
  { key: 'existing_liens_amount', label: 'Current mortgage balance', type: 'money', showIf: isRefi, hint: 'Total you owe on the home today' },
  { key: 'refi_type', label: 'Type of refinance', type: 'select', showIf: isRefi, options: ['Rate & Term', 'Cash-Out', 'Streamline'] },
  { key: 'cash_out_purpose', label: 'What will the cash be used for?', type: 'select', showIf: f => isRefi(f) && f.shared?.refi_type === 'Cash-Out', options: ['Home Improvement', 'Debt Consolidation', 'Other'] },
  { key: 'loan_amount', label: 'Loan amount you are requesting', type: 'money', hint: 'Leave blank if you are not sure — your loan officer will help' },
  { key: 'occupancy', label: 'How will you use the property?', type: 'select', req: true, options: ['Primary Residence', 'Second Home', 'Investment'] },
  { key: 'prop_type', label: 'Property type', type: 'select', req: true, options: ['Single Family Residence', 'Condo', 'Townhouse', '2-4 Unit', 'Manufactured'] },
  { key: 'num_units', label: 'Number of units', type: 'select', options: ['1', '2', '3', '4'] },
  // Refinance-only property details (hidden on Purchase by design)
  { key: 'year_built', label: 'Year built', type: 'number', showIf: isRefi },
  { key: 'year_acquired', label: 'Year you bought it', type: 'number', showIf: isRefi },
  { key: 'orig_cost', label: 'Original purchase price', type: 'money', showIf: isRefi },
  { key: 'construction_method', label: 'Construction', type: 'select', showIf: isRefi, options: ['Site Built', 'Manufactured', 'Modular'] },
  { key: 'attachment_type', label: 'Attachment', type: 'select', showIf: isRefi, options: ['Detached', 'Attached', 'Semi-Detached'] },
  { key: 'acreage', label: 'Lot size (acres)', type: 'number', showIf: isRefi },
];

const PERSONAL_FIELDS = [
  { key: 'first_nm',  label: 'First name', type: 'text', req: true },
  { key: 'middle_nm', label: 'Middle name', type: 'text' },
  { key: 'last_nm',   label: 'Last name', type: 'text', req: true },
  { key: 'suffix',    label: 'Suffix', type: 'select', options: ['Jr.', 'Sr.', 'II', 'III', 'IV'] },
  { key: 'ssn', label: 'Social Security number', type: 'ssn', req: true, hint: 'Needed to pull your credit later. Stored encrypted in transit.' },
  { key: 'dob', label: 'Date of birth', type: 'date', req: true },
  { key: 'cell_phone', label: 'Mobile phone', type: 'phone', req: true },
  { key: 'email', label: 'Email', type: 'email', readOnly: true, hint: 'This is your sign-in email. Ask your loan officer to change it.' },
  { key: 'citizenship', label: 'Citizenship', type: 'radio', req: true, span: 2,
    options: [['us_citizen', 'U.S. citizen'], ['perm_resident', 'Permanent resident'], ['non_perm', 'Non-permanent resident'], ['foreign', 'Foreign national']] },
  { key: 'marital_status', label: 'Marital status', type: 'radio', req: true, span: 2, options: ['Married', 'Unmarried', 'Separated'] },
  { key: 'num_dependents', label: 'Number of dependents', type: 'select', options: ['0', '1', '2', '3', '4', '5', '6'] },
  { key: 'dependents_ages', label: 'Their ages', type: 'text', placeholder: 'e.g. 4, 9', showIf: f => Number(f.borrower?.num_dependents) > 0 },
  { key: 'is_veteran', label: 'Are you a veteran or currently serving in the U.S. military?', type: 'yesno', span: 2 },
  { key: 'va_use_type', label: 'VA home loan benefit', type: 'select', showIf: f => f.borrower?.is_veteran == 1, options: ['First Use', 'Subsequent Use', 'Exempt'] },
  { key: 'is_disabled_vet', label: 'Do you receive VA disability compensation?', type: 'yesno', showIf: f => f.borrower?.is_veteran == 1 },
];

export const ADDRESS_FIELDS = (prefix = '') => [
  { key: prefix ? 'addr1' : 'address_street', label: 'Street address', type: 'text', req: true, span: 2 },
  { key: prefix ? 'unit' : 'address_unit', label: 'Apt / Unit', type: 'text' },
  { key: prefix ? 'city' : 'address_city', label: 'City', type: 'text', req: true },
  { key: prefix ? 'state' : 'address_state', label: 'State', type: 'state', req: true },
  { key: prefix ? 'zip' : 'address_zip', label: 'ZIP code', type: 'zip', req: true },
];

const ADDRESS_FIELDS_MAIN = [
  ...ADDRESS_FIELDS(),
  { key: 'current_how_long_addr', label: 'How long have you lived here?', type: 'years', req: true },
  { key: 'housing', label: 'Do you own or rent?', type: 'radio', req: true, options: ['Own', 'Rent', 'Living Rent Free'] },
  { key: 'rent_monthly', label: 'Monthly rent', type: 'money', showIf: f => f.borrower?.housing === 'Rent' },
  { key: 'mailing_same_as_present', label: 'Is your mailing address the same?', type: 'yesno', span: 2, defaultValue: 1 },
  { key: 'mailing_address_street', label: 'Mailing street address', type: 'text', span: 2, showIf: f => f.borrower?.mailing_same_as_present == 0 },
  { key: 'mailing_address_unit_num', label: 'Apt / Unit', type: 'text', showIf: f => f.borrower?.mailing_same_as_present == 0 },
  { key: 'mailing_address_city', label: 'City', type: 'text', showIf: f => f.borrower?.mailing_same_as_present == 0 },
  { key: 'mailing_address_state', label: 'State', type: 'state', showIf: f => f.borrower?.mailing_same_as_present == 0 },
  { key: 'mailing_address_zip', label: 'ZIP code', type: 'zip', showIf: f => f.borrower?.mailing_same_as_present == 0 },
];

// Previous-address entry (prev_addresses_json), same keys the CRM uses
export const PREV_ADDRESS_FIELDS = [
  ...ADDRESS_FIELDS('p'),
  { key: 'years', label: 'How long did you live there?', type: 'years', req: true },
  { key: 'own', label: 'Owned or rented?', type: 'radio', req: true, options: ['Own', 'Rent', 'Living Rent Free'] },
];

// ── list entries ────────────────────────────────────────────────────────
export const INCOME_FIELDS = [
  { key: 'type', label: 'Type of income', type: 'radio', span: 2, req: true,
    options: [['Employment Income', 'Job (W-2)'], ['Self-Employment', 'Self-employed / business owner'], ['Other Income', 'Other (retirement, Social Security, rental, support…)']] },
  { key: 'employer', label: 'Employer or business name', type: 'text', req: true, span: 2, showIf: e => e.type !== 'Other Income' },
  { key: 'position', label: 'Position / title', type: 'text', showIf: e => e.type !== 'Other Income' },
  { key: 'startDate', label: 'Start date', type: 'date', showIf: e => e.type !== 'Other Income' },
  { key: 'currentEmp', label: 'I currently work here', type: 'checkbox', defaultValue: true, showIf: e => e.type !== 'Other Income' },
  { key: 'endDate', label: 'End date', type: 'date', showIf: e => e.type !== 'Other Income' && e.currentEmp === false },
  { key: 'phone', label: 'Employer phone', type: 'phone', showIf: e => e.type === 'Employment Income' },
  { key: 'familyRelated', label: 'I am employed by a family member or a party to the transaction', type: 'checkbox', span: 2, showIf: e => e.type === 'Employment Income' },
  { key: 'otherDesc', label: 'Describe the income', type: 'text', span: 2, req: true, showIf: e => e.type === 'Other Income', placeholder: 'e.g. Social Security, pension, rental income' },
  { key: 'base', label: 'Monthly base income', type: 'money', req: true, showIf: e => e.type !== 'Other Income' },
  { key: 'overtime', label: 'Monthly overtime', type: 'money', showIf: e => e.type === 'Employment Income' },
  { key: 'bonuses', label: 'Monthly bonus', type: 'money', showIf: e => e.type === 'Employment Income' },
  { key: 'commission', label: 'Monthly commission', type: 'money', showIf: e => e.type === 'Employment Income' },
  { key: 'tips', label: 'Monthly tips', type: 'money', showIf: e => e.type === 'Employment Income' },
  { key: 'otherW2', label: 'Monthly amount', type: 'money', req: true, showIf: e => e.type === 'Other Income' },
];

export const ASSET_FIELDS = [
  { key: 'type', label: 'Account type', type: 'select', req: true, options: ['Checking Account', 'Savings Account', 'Retirement (401k/IRA)', 'Stocks / Bonds / Mutual Funds', 'Other Assets'] },
  { key: 'depositor', label: 'Bank or institution', type: 'text', req: true },
  { key: 'acct', label: 'Account number (last 4 is fine)', type: 'text' },
  { key: 'value', label: 'Current balance', type: 'money', req: true },
  { key: 'joint', label: 'Held jointly with my co-borrower', type: 'checkbox', span: 2 },
];

export const LIABILITY_FIELDS = [
  { key: 'type', label: 'Type', type: 'select', req: true, options: ['Mortgage', 'Auto Loan', 'Student Loan', 'Installment Loan', 'Revolving', 'Child Support', 'Alimony', 'Other'] },
  { key: 'creditor', label: 'Creditor / lender', type: 'text', req: true },
  { key: 'acct', label: 'Account number (last 4 is fine)', type: 'text' },
  { key: 'balance', label: 'Unpaid balance', type: 'money', req: true },
  { key: 'payment', label: 'Monthly payment', type: 'money', req: true },
  { key: 'joint', label: 'Shared with my co-borrower', type: 'checkbox', span: 2 },
];

export const REO_FIELDS = [
  { key: 'addr1', label: 'Street address', type: 'text', req: true, span: 2 },
  { key: 'city', label: 'City', type: 'text', req: true },
  { key: 'state', label: 'State', type: 'state', req: true },
  { key: 'zip', label: 'ZIP code', type: 'zip', req: true },
  { key: 'propType', label: 'Property type', type: 'select', options: ['Single Family Residence', 'Condo', 'Townhouse', '2-4 Unit', 'Manufactured'] },
  { key: 'occupancy', label: 'How is it used?', type: 'select', options: ['Primary Residence', 'Second Home', 'Investment'] },
  { key: 'status', label: 'What will happen to it?', type: 'select', req: true, options: ['Retain', 'Pending Sale', 'Sold', 'Rental'] },
  { key: 'marketValue', label: 'Estimated value', type: 'money', req: true },
  { key: 'mortgagePayment', label: 'Monthly mortgage payment (if any)', type: 'money' },
  { key: 'rentalIncome', label: 'Monthly rent received (if rented)', type: 'money', showIf: e => e.status === 'Rental' || e.occupancy === 'Investment' },
];

// URLA Section 5 — same ids the CRM stores (declarations_json)
export const DECLARATIONS = [
  { id: 'A',  q: 'Will you occupy the property as your primary residence?' },
  { id: 'A1', q: 'If yes — have you had an ownership interest in another property in the last three years?', showIf: d => d.A === 'yes' },
  { id: 'B',  q: 'Do you have a family relationship or business affiliation with the seller of the property?' },
  { id: 'C',  q: 'Are you borrowing any money for this transaction, or getting money from another party, that is not on this application?' },
  { id: 'D1', q: 'Have you or will you be applying for a mortgage loan on another property before this loan closes?' },
  { id: 'D2', q: 'Have you or will you be applying for any new credit before this loan closes?' },
  { id: 'E',  q: 'Will this property be subject to a lien that could take priority over the first mortgage (such as a clean-energy / PACE lien)?' },
  { id: 'F',  q: 'Are you a co-signer or guarantor on any debt not listed on this application?' },
  { id: 'G',  q: 'Are there any outstanding judgments against you?' },
  { id: 'H',  q: 'Are you currently delinquent or in default on a federal debt?' },
  { id: 'I',  q: 'Are you a party to a lawsuit in which you could be personally financially liable?' },
  { id: 'J',  q: 'Have you conveyed title to any property in lieu of foreclosure in the past 7 years?' },
  { id: 'K',  q: 'Have you completed a pre-foreclosure sale or short sale in the past 7 years?' },
  { id: 'L',  q: 'Have you had property foreclosed upon in the last 7 years?' },
  { id: 'M',  q: 'Have you declared bankruptcy within the past 7 years?' },
  { id: 'N',  q: 'Are you a first-time homebuyer?' },
];

export const DEMOGRAPHICS = {
  ethnicityDetail: ['Mexican', 'Puerto Rican', 'Cuban', 'Other Hispanic or Latino'],
  races: ['AmericanIndian', 'Asian', 'BlackOrAfricanAmerican', 'PacificIslander', 'White'],
  raceLabels: { AmericanIndian: 'American Indian or Alaska Native', Asian: 'Asian', BlackOrAfricanAmerican: 'Black or African American', PacificIslander: 'Native Hawaiian or Other Pacific Islander', White: 'White' },
  asianDetail: ['Asian Indian', 'Chinese', 'Filipino', 'Japanese', 'Korean', 'Vietnamese', 'Other Asian'],
  pacificDetail: ['Native Hawaiian', 'Guamanian or Chamorro', 'Samoan', 'Other Pacific Islander'],
};

// ── the steps ───────────────────────────────────────────────────────────
export const STEPS = [
  { id: 'loan',         short: 'Loan',          title: 'Your loan',               scope: 'shared',   fields: LOAN_FIELDS,
    intro: 'A few basics about the loan and the property. If you are not sure about a number, give your best estimate — your loan officer will refine it with you.' },
  { id: 'personal',     short: 'About you',     title: 'About you',               scope: 'borrower', fields: PERSONAL_FIELDS,
    intro: 'Your legal name as it appears on your ID.' },
  { id: 'addresses',    short: 'Addresses',     title: 'Where you live',          scope: 'borrower', fields: ADDRESS_FIELDS_MAIN,
    intro: 'Lenders need two years of address history. If you have lived at your current address for less than two years, we will ask for the previous one.' },
  { id: 'income',       short: 'Income',        title: 'Employment & income',     scope: 'list', list: 'incomes',     entryFields: INCOME_FIELDS, entryName: 'income source', minEntries: 1,
    intro: 'Add each job or income source. Two years of employment history is standard — include a previous job if you started your current one recently.' },
  { id: 'assets',       short: 'Assets',        title: 'Bank accounts & assets',  scope: 'list', list: 'assets',      entryFields: ASSET_FIELDS, entryName: 'account', noneLabel: 'I do not have any accounts or assets to list',
    intro: 'Accounts that will cover your down payment, closing costs and reserves.' },
  { id: 'liabilities',  short: 'Debts',         title: 'Debts & payments',        scope: 'list', list: 'liabilities', entryFields: LIABILITY_FIELDS, entryName: 'debt', noneLabel: 'I do not have any monthly debts',
    intro: 'Car loans, student loans, credit cards, support payments. Your credit report will list most of these — adding them here helps your loan officer check it.' },
  { id: 'reo',          short: 'Real estate',   title: 'Real estate you own',     scope: 'list', list: 'reos',        entryFields: REO_FIELDS, entryName: 'property', noneLabel: 'I do not own any real estate',
    intro: 'Any property you own today, including the one you are refinancing.' },
  { id: 'declarations', short: 'Declarations',  title: 'Declarations',            scope: 'declarations',
    intro: 'Required questions on every mortgage application. Answer each one for yourself.' },
  { id: 'demographics', short: 'Demographics',  title: 'Demographic information', scope: 'demographics',
    intro: 'The federal government asks lenders to collect this to monitor fair-lending compliance. You are not required to provide it, and your answers do not affect your application.' },
  { id: 'review',       short: 'Review',        title: 'Review & finish',         scope: 'review',
    intro: 'Check each section. When everything is complete, let your loan officer know you are done.' },
];

// ── helpers shared by renderer and review ───────────────────────────────
export const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Which fields of a step currently apply (showIf) */
export function visibleFields(fields, ctx) {
  return (fields || []).filter(f => !f.showIf || f.showIf(ctx));
}

/** Missing required field labels for a flat object */
export function missingIn(fields, obj, ctx) {
  return visibleFields(fields, ctx).filter(f => f.req && !f.virtual && isEmpty(obj?.[f.key])).map(f => f.label);
}

/**
 * Step status from the data alone: 'done' | 'started' | 'todo'.
 * form = { shared, borrower, lists, declarations, demographics, flags }
 */
export function stepStatus(step, form) {
  const flags = form.flags || {};
  switch (step.scope) {
    case 'shared': {
      const ctx = { ...form, _hasProperty: flags._hasProperty };
      const missing = missingIn(step.fields, form.shared, ctx);
      const any = visibleFields(step.fields, ctx).some(f => !f.virtual && !isEmpty(form.shared?.[f.key]) && f.key !== 'purpose' && f.key !== 'num_units');
      return missing.length === 0 && (any || flags._hasProperty) ? 'done' : any ? 'started' : 'todo';
    }
    case 'borrower': {
      const missing = missingIn(step.fields, form.borrower, form);
      let extra = [];
      if (step.id === 'addresses') {
        const yrs = Number(form.borrower?.current_how_long_addr);
        const prev = form.borrower?.prev_addresses_json || [];
        const covered = yrs + prev.reduce((a, p) => a + (Number(p.years) || 0), 0);
        if (Number.isFinite(yrs) && yrs < 2 && (prev.length === 0 || covered < 2)) extra.push('Previous address (two years of history needed)');
        prev.forEach((p, i) => missingIn(PREV_ADDRESS_FIELDS, p, p).forEach(l => extra.push(`Previous address ${i + 1}: ${l}`)));
      }
      const all = [...missing, ...extra];
      const any = visibleFields(step.fields, form).some(f => !isEmpty(form.borrower?.[f.key]) && !['email', 'first_nm', 'last_nm', 'mailing_same_as_present'].includes(f.key));
      return all.length === 0 ? 'done' : any ? 'started' : 'todo';
    }
    case 'list': {
      const entries = form.lists?.[step.list] || [];
      const none = flags[`none_${step.list}`];
      if (entries.length === 0) return none ? 'done' : 'todo';
      const bad = entries.some(e => missingIn(step.entryFields, e, e).length > 0);
      return bad ? 'started' : 'done';
    }
    case 'declarations': {
      const d = form.declarations || {};
      const qs = DECLARATIONS.filter(q => !q.showIf || q.showIf(d));
      const answered = qs.filter(q => d[q.id] === 'yes' || d[q.id] === 'no').length;
      return answered === qs.length ? 'done' : answered > 0 ? 'started' : 'todo';
    }
    case 'demographics': {
      const d = form.demographics || {};
      const eth = d.hispanic === true || d.hispanic === false || d.ethnicityRefused;
      const sex = !!d.sex || d.sexRefused;
      const race = (Array.isArray(d.races) && d.races.length > 0) || d.raceRefused;
      return eth && sex && race ? 'done' : (eth || sex || race) ? 'started' : 'todo';
    }
    default: return 'todo';
  }
}

/** Human list of what is still missing on a step (for Review) */
export function stepMissing(step, form) {
  const flags = form.flags || {};
  switch (step.scope) {
    case 'shared': return missingIn(step.fields, form.shared, { ...form, _hasProperty: flags._hasProperty });
    case 'borrower': {
      const m = missingIn(step.fields, form.borrower, form);
      if (step.id === 'addresses') {
        const yrs = Number(form.borrower?.current_how_long_addr);
        const prev = form.borrower?.prev_addresses_json || [];
        const covered = yrs + prev.reduce((a, p) => a + (Number(p.years) || 0), 0);
        if (Number.isFinite(yrs) && yrs < 2 && (prev.length === 0 || covered < 2)) m.push('A previous address — two years of history are needed');
      }
      return m;
    }
    case 'list': {
      const entries = form.lists?.[step.list] || [];
      if (entries.length === 0) return flags[`none_${step.list}`] ? [] : [step.minEntries ? `At least one ${step.entryName}` : `Add a ${step.entryName}, or confirm you have none`];
      const out = [];
      entries.forEach((e, i) => missingIn(step.entryFields, e, e).forEach(l => out.push(`${step.entryName} ${i + 1}: ${l}`)));
      return out;
    }
    case 'declarations': {
      const d = form.declarations || {};
      return DECLARATIONS.filter(q => (!q.showIf || q.showIf(d)) && d[q.id] !== 'yes' && d[q.id] !== 'no').map(q => `Question ${q.id}`);
    }
    case 'demographics': {
      const d = form.demographics || {};
      const m = [];
      if (!(d.hispanic === true || d.hispanic === false || d.ethnicityRefused)) m.push('Ethnicity (or "I do not wish to provide")');
      if (!(d.sex || d.sexRefused)) m.push('Sex (or "I do not wish to provide")');
      if (!((Array.isArray(d.races) && d.races.length) || d.raceRefused)) m.push('Race (or "I do not wish to provide")');
      return m;
    }
    default: return [];
  }
}
