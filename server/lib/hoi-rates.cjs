'use strict';
/**
 * server/lib/hoi-rates.cjs — market-average homeowners premium lookup.
 *
 * The provider portal shows the agent a "market estimate" for the subject
 * property's ZIP so they have a starting point. It is built from public
 * state averages (NAIC / III / Bankrate / Policygenius) and ZIP3 regional
 * multipliers (coast, hail corridor, wildfire) stored in hoi_rate_table —
 * see seed_hoi_rates.sql and the sources sheet. Every row cites its source.
 *
 * Resolution order: state + zip3 → state → US. The answer says which one
 * was used ("basis") so the agent can judge it. It is an estimate for the
 * agent only; the MLO never sees it (routes/provider.cjs is the only caller).
 */
const db = require('../db.cjs');

const STATE_NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };
const BY_NAME = Object.fromEntries(Object.entries(STATE_NAMES).map(([k, v]) => [v.toLowerCase(), k]));

function stateCode(v) {
  const s = String(v || '').trim();
  if (/^[A-Za-z]{2}$/.test(s) && STATE_NAMES[s.toUpperCase()]) return s.toUpperCase();
  return BY_NAME[s.toLowerCase()] || null;
}

const money = v => (v == null ? null : Math.round(Number(v) * 100) / 100);

/**
 * estimate({ zip, state }) → { annualPremium, monthly, basis, regionLabel, stateCode, stateName,
 *   typicalDeductible, windHailPct, source, sourceUrl, asOf, note } — or { annualPremium:null, note } when nothing fits.
 */
async function estimate({ zip, state }) {
  const zip5 = String(zip || '').replace(/\D/g, '').slice(0, 5);
  const zip3 = zip5.length === 5 ? zip5.slice(0, 3) : null;
  const st = stateCode(state);
  const [rows] = await db.query(
    `SELECT * FROM hoi_rate_table WHERE (state=? AND zip3=?) OR (state=? AND zip3 IS NULL) OR (state='US' AND zip3 IS NULL)
      ORDER BY FIELD(state, ?, 'US'), zip3 IS NULL, id`, [st || '', zip3 || '', st || '', st || '']);
  const zipRow   = rows.find(r => r.state === st && r.zip3 === zip3);
  const stateRow = rows.find(r => r.state === st && r.zip3 == null);
  const usRow    = rows.find(r => r.state === 'US' && r.zip3 == null);
  const pick = zipRow || stateRow || usRow;
  if (!pick) return { annualPremium: null, monthly: null, basis: 'none', note: 'No rate data available for this address yet.' };

  // A zip3 row either carries its own premium or a multiplier on the state average.
  let annual = Number(pick.avg_annual_premium);
  if (zipRow && (!annual || annual <= 0) && zipRow.multiplier && stateRow) annual = Number(stateRow.avg_annual_premium) * Number(zipRow.multiplier);
  const basis = zipRow ? 'zip3' : stateRow ? 'state' : 'national';
  const label = zipRow?.region_label || (stateRow ? `${STATE_NAMES[st]} state average` : 'U.S. national average');
  const note = basis === 'zip3'
    ? `Average annual premium for ZIP ${zip3}xx (${zipRow.region_label || STATE_NAMES[st]}), derived from the ${STATE_NAMES[st]} state average × regional factor ${zipRow.multiplier ? Number(zipRow.multiplier).toFixed(2) : '—'}.`
    : basis === 'state'
      ? `${STATE_NAMES[st]} state average; no regional factor on file for ZIP ${zip3 || '—'}xx.`
      : `National average used — state ${st || '(unknown)'} not in the rate table.`;
  return {
    annualPremium: money(annual), monthly: money(annual / 12),
    basis, regionLabel: label, stateCode: st, stateName: st ? STATE_NAMES[st] : null, zip3,
    typicalDeductible: money(pick.typical_deductible ?? stateRow?.typical_deductible ?? usRow?.typical_deductible),
    windHailPct: pick.wind_hail_pct != null ? Number(pick.wind_hail_pct) : (stateRow?.wind_hail_pct != null ? Number(stateRow.wind_hail_pct) : null),
    source: pick.source || stateRow?.source || null, sourceUrl: pick.source_url || stateRow?.source_url || null, asOf: pick.as_of || stateRow?.as_of || null,
    stateSource: stateRow ? { source: stateRow.source, sourceUrl: stateRow.source_url, asOf: stateRow.as_of, annualPremium: money(stateRow.avg_annual_premium) } : null,
    note,
  };
}

module.exports = { estimate, stateCode, STATE_NAMES };
