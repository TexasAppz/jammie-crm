'use strict';
/**
 * server/lib/apply-fields.cjs — what a borrower may write, and how.
 *
 * Every write from the portal goes through these lists. A key that is not
 * here is dropped, never saved. Each entry says how to coerce the value so
 * a stray string can't poison a DECIMAL column and reject the whole row.
 *
 * Three groups:
 *   BORROWER   per-person identity + address history. Lives on
 *              form_1003_main_borrower (slot 1) or form_1003_coborrowers
 *              (slots 2..4) — identical column names.
 *   SHARED     the loan itself. Primary borrower only. Split between the
 *              loans row and the 1003 row.
 *   LISTS      incomes / assets / liabilities / REO — loan-level JSON on the
 *              1003 row, each entry attributed to a borrower by label, so two
 *              people can edit "their" entries without clobbering each other.
 *              declarations_json / demographics_json are arrays indexed by
 *              (slot - 1).
 */

// ── coercers ────────────────────────────────────────────────────────────
const str  = max => v => (v == null ? null : String(v).trim().slice(0, max) || null);
const num  = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
const int  = v => { const n = num(v); return n == null ? null : Math.trunc(n); };
const bool = v => (v === true || v === 1 || v === '1' || v === 'true' || v === 'yes') ? 1 : (v == null || v === '' ? null : 0);
const date = v => { if (!v) return null; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const json = v => { if (v == null) return null; try { return JSON.stringify(Array.isArray(v) || typeof v === 'object' ? v : JSON.parse(v)); } catch { return null; } };
const oneOf = (list, max = 60) => v => (list.includes(v) ? v : (v == null || v === '' ? null : str(max)(v)));

// ── per-borrower columns (both tables) ───────────────────────────────────
const BORROWER = {
  first_nm: str(100), middle_nm: str(100), last_nm: str(100), suffix: str(20),
  alt_names: json,
  ssn: v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 9 ? `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}` : (d ? null : null); },
  dob: date,
  citizenship: oneOf(['us_citizen', 'perm_resident', 'non_perm', 'foreign'], 50),
  marital_status: oneOf(['Married', 'Unmarried', 'Separated'], 20),
  num_dependents: int, dependents_ages: str(100),
  email: str(255), cell_phone: str(30),
  is_veteran: bool, is_disabled_vet: bool, is_exempt_funding_fee: bool, va_use_type: str(60),
  address_street: str(255), address_unit: str(50), address_city: str(100), address_state: str(50), address_zip: str(10), address_country: str(100),
  current_how_long_addr: num,
  housing: oneOf(['Own', 'Rent', 'Living Rent Free'], 30),
  rent_monthly: num,
  prev_addresses_json: json,
  mailing_same_as_present: bool,
  mailing_address_street: str(255), mailing_address_unit_num: str(50), mailing_address_city: str(100), mailing_address_state: str(50), mailing_address_zip: str(10), mailing_address_country: str(100),
};
// The CRM reads these from the main row only; co-borrower rows don't have them.
const BORROWER_PRIMARY_ONLY = new Set([]);

// ── shared (loan-level) — primary only ───────────────────────────────────
const SHARED_LOANS = {
  purpose: oneOf(['Purchase Home', 'Refinance'], 20),
  sales_price: num, appraised_value: num, down_payment: num, loan_amount: num,
  existing_liens_amount: num,
  refi_type: str(50), cash_out_purpose: str(100),
};
const SHARED_1003 = {
  sp_addr1: str(255), sp_unit: str(50), sp_city: str(100), sp_state: str(50), sp_zip: str(20), sp_county: str(100),
  prop_type: str(80), attachment_type: str(40), occupancy: str(60),
  num_units: int, year_built: int, year_acquired: int, construction_method: str(50), acreage: num, orig_cost: num,
};

// ── lists ───────────────────────────────────────────────────────────────
// entry.<ownerKey> carries the borrower label; the server rewrites it, the
// client never decides whose entry it is.
const LISTS = {
  incomes:     { column: 'incomes_json',     ownerKey: 'borrower' },
  assets:      { column: 'assets_json',      ownerKey: 'owner' },
  liabilities: { column: 'liabilities_json', ownerKey: 'borrower' },
  reos:        { column: 'reos_json',        ownerKey: 'borrower' },
};
const MAX_LIST = 40;
const MAX_ENTRY_KEYS = 40;

/** Borrower label for a seat — the same strings the CRM uses. */
function labelForSlot(slot) {
  return slot === 1 ? 'Borrower' : slot === 2 ? 'Co-Borrower' : `Borrower ${slot}`;
}

/** Apply a coercer map to an input object; unknown keys are dropped. */
function coerce(map, input, { skip } = {}) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, fn] of Object.entries(map)) {
    if (skip && skip.has(k)) continue;
    if (Object.prototype.hasOwnProperty.call(input, k)) out[k] = fn(input[k]);
  }
  return out;
}

/** Sanitise one list entry: plain object, bounded size, scalar values only. */
function cleanEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(e)) {
    if (++n > MAX_ENTRY_KEYS) break;
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
    if (v == null || typeof v === 'boolean' || typeof v === 'number') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 500);
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).filter(x => typeof x === 'string').map(x => x.slice(0, 100));  // demographics: races[], ethnicities[]
  }
  if (out.id == null) out.id = Date.now() + Math.floor(Math.random() * 1000);
  return out;
}

/**
 * Merge a borrower's entries into the loan-level list: drop that borrower's
 * old entries, keep everyone else's, append the new ones with the label set.
 */
function mergeList(existingRaw, mine, label, ownerKey) {
  let all = [];
  try { const v = JSON.parse(existingRaw || '[]'); all = Array.isArray(v) ? v : []; } catch { all = []; }
  const others = all.filter(e => e && e[ownerKey] !== label);
  const cleaned = (Array.isArray(mine) ? mine : []).slice(0, MAX_LIST).map(cleanEntry).filter(Boolean).map(e => ({ ...e, [ownerKey]: label }));
  // Entries with no label at all were written by the CRM before labels
  // mattered; they belong to the primary.
  const merged = label === 'Borrower'
    ? [...others.filter(e => e[ownerKey] != null), ...cleaned]
    : [...others, ...cleaned];
  // Primary first, then co-borrowers in seat order: the CRM treats the first
  // income entry as the primary's employer.
  const rank = e => { const l = e[ownerKey]; return l == null || l === 'Borrower' ? 1 : l === 'Co-Borrower' ? 2 : (parseInt(String(l).replace(/\D/g, ''), 10) || 9); };
  return merged.map((e, i) => [rank(e), i, e]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}

/** Pick a borrower's entries out of the loan-level list. */
function pickList(raw, label, ownerKey) {
  try {
    const v = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter(e => e && (e[ownerKey] === label || (label === 'Borrower' && e[ownerKey] == null)));
  } catch { return []; }
}

/** Replace index (slot-1) of a per-borrower array column. */
function setIndexed(raw, slot, value) {
  let arr = [];
  try { const v = JSON.parse(raw || '[]'); arr = Array.isArray(v) ? v : []; } catch { arr = []; }
  while (arr.length < slot) arr.push({});
  arr[slot - 1] = cleanEntry(value) || {};
  delete arr[slot - 1].id;
  return JSON.stringify(arr);
}
function getIndexed(raw, slot) {
  try { const v = JSON.parse(raw || '[]'); return (Array.isArray(v) && v[slot - 1] && typeof v[slot - 1] === 'object') ? v[slot - 1] : {}; } catch { return {}; }
}

module.exports = {
  BORROWER, BORROWER_PRIMARY_ONLY, SHARED_LOANS, SHARED_1003, LISTS,
  labelForSlot, coerce, mergeList, pickList, setIndexed, getIndexed, cleanEntry,
};
