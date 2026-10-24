'use strict';
/**
 * server/lib/quotes.cjs — shared logic for the insurance/title quote flow.
 * Used by routes/quotes.cjs (MLO side) and routes/provider.cjs (provider side).
 *
 *   snapshotFor(loanId)      the four shared items, read from the loan + 1003 rows
 *   readiness(snapshot)      what is missing before a request may be sent
 *   createRequest(...)       insert request + number + audit row (one open per loan/provider)
 *   submitQuote(...)         insert quote with revision letter, supersede the previous one
 *   requestView(...)         the shape both portals render (quotes, messages, effective status)
 *
 *   decideQuote(...)         the BORROWER's accept/decline (or the MLO recording it on their behalf):
 *                            accepting one quote marks every other open quote on the loan 'not_selected'
 *                            (reversible while still valid), locks loans.pmt_hoi to the premium, logs it
 *   hideQuote/unhideQuote    MLO keeps a quote away from the borrower, with a reason
 *   applyEstimateIfBlank     the unofficial figure: market estimate into loans.pmt_hoi until a quote is accepted
 *   unlockHoi                MLO frees a locked figure (reason required, logged)
 *   borrowerView(...)        what the borrower portal renders (hidden quotes removed, no provider thread)
 *
 * Status rules: a request's status follows its latest quote; a quoted request
 * whose quote's valid_until has passed reads as 'expired' (evaluated on read,
 * no cron). The snapshot never changes after insert — a re-request after the
 * loan changed is a new request (version + 1) and closes the old one.
 *
 * Who sees what: the provider never sees the borrower thread, decline reasons,
 * or who else quoted — only 'Accepted by borrower' / 'Not selected'. The
 * borrower never sees the MLO<->agent thread or the provider's market estimate.
 */
const db = require('../db.cjs');
const rates = require('./hoi-rates.cjs');
const { stateCode } = rates;

const DISCLOSURE_VERSION = '2026-10-v1';
const DISCLOSURE_TEXT = 'The borrower has been informed that their name and the property address will be shared with insurance providers so that quotes can be prepared.';
const SHARED_FIELDS = ['loanNumber', 'borrowers.firstName', 'borrowers.lastName', 'property.street', 'property.unit', 'property.city', 'property.state', 'property.zip'];
const DEFAULT_VALID_DAYS = 30;

const pad6 = n => String(n).padStart(6, '0');
const letter = n => String.fromCharCode(64 + Math.min(Math.max(n, 1), 26));   // 1 → A
const today = () => new Date().toISOString().slice(0, 10);
const ymd = d => d ? new Date(d).toISOString().slice(0, 10) : null;
const seatLabel = slot => slot === 1 ? 'Borrower' : slot === 2 ? 'Co-Borrower' : `Borrower ${slot}`;

async function loadLoan(loanId) {
  const [[loan]] = await db.query('SELECT * FROM loans WHERE id=?', [loanId]);
  return loan || null;
}

/** The four items — and nothing else — from the loan's 1003 rows. */
async function snapshotFor(loanId) {
  const loan = await loadLoan(loanId);
  if (!loan) return null;
  const [[main]] = await db.query('SELECT first_nm, last_nm, sp_addr1, sp_unit, sp_city, sp_state, sp_zip FROM form_1003_main_borrower WHERE loan_id=? ORDER BY updated_at DESC, id DESC LIMIT 1', [loanId]).catch(() => [[null]]);
  const [cobs] = await db.query('SELECT slot, first_nm, last_nm FROM form_1003_coborrowers WHERE loan_id=? ORDER BY slot', [loanId]).catch(() => [[]]);
  const borrowers = [];
  if (main) borrowers.push({ slot: 1, label: 'Borrower', firstName: main.first_nm || '', lastName: main.last_nm || '' });
  for (const c of cobs) borrowers.push({ slot: c.slot, label: seatLabel(c.slot), firstName: c.first_nm || '', lastName: c.last_nm || '' });
  // Subject property: the 1003 row first, the loans.subject_property free text as a fallback.
  const property = {
    street: main?.sp_addr1 || '', unit: main?.sp_unit || '', city: main?.sp_city || '',
    state: stateCode(main?.sp_state) || String(main?.sp_state || '').trim(), zip: String(main?.sp_zip || '').replace(/\D/g, '').slice(0, 5),
  };
  if (!property.street && loan.subject_property && loan.subject_property !== 'TBD') {
    // "77 Oak Ave, Frisco TX 75034" — best-effort split so the readiness check can say what is missing.
    const m = String(loan.subject_property).match(/^(.*?),\s*([^,]+?)\s+([A-Za-z]{2}|[A-Za-z ]+?)\s*(\d{5})?$/);
    if (m) { property.street = m[1].trim(); property.city = m[2].trim(); property.state = stateCode(m[3]) || m[3].trim(); property.zip = m[4] || ''; }
    else property.street = String(loan.subject_property).trim();
  }
  return { loanId: loan.id, loanNumber: loan.loan_number, organizationId: loan.organization_id || 1, borrowers, property };
}

/** [] when the snapshot can be sent; otherwise the missing items, in the order the MLO fills them. */
function readiness(snap) {
  const p = [];
  if (!snap) return ['Loan not found'];
  if (!snap.loanNumber) p.push('Loan number');
  const b = snap.borrowers[0];
  if (!b || !b.firstName) p.push('Borrower first name');
  if (!b || !b.lastName) p.push('Borrower last name');
  snap.borrowers.slice(1).forEach(c => { if (!c.firstName || !c.lastName) p.push(`${c.label} first and last name`); });
  if (!snap.property.street) p.push('Property street address');
  if (!snap.property.city) p.push('Property city');
  if (!stateCode(snap.property.state)) p.push('Property state');
  if (!/^\d{5}$/.test(snap.property.zip || '')) p.push('Property ZIP (5 digits)');
  return p;
}

async function openRequest(loanId, providerId, quoteType = 'insurance') {
  const [[r]] = await db.query(
    `SELECT * FROM insurance_quote_requests WHERE loan_id=? AND provider_id=? AND quote_type=? AND status IN ('requested','viewed','quoted') ORDER BY id DESC LIMIT 1`,
    [loanId, providerId, quoteType]);
  return r || null;
}

/**
 * Create a request for one provider. Returns { request, skipped:'open' } when one is already open.
 * Writes the data_share_audit row in the same call — a request without its audit row must not exist.
 */
async function createRequest({ loanId, providerId, quoteType = 'insurance', snapshot, user, ip, disclosed, supersede = false }) {
  const existing = await openRequest(loanId, providerId, quoteType);
  if (existing && !supersede) return { request: existing, skipped: 'open' };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let version = 1;
    if (existing && supersede) {
      await conn.query(`UPDATE insurance_quote_requests SET status='withdrawn', closed_at=NOW(), close_reason='Replaced by a new request' WHERE id=?`, [existing.id]);
      await conn.query(`UPDATE insurance_quotes SET status='superseded' WHERE request_id=? AND status='quoted'`, [existing.id]);
      version = (existing.version || 1) + 1;
    }
    const [[v]] = await conn.query('SELECT COALESCE(MAX(version),0) AS v FROM insurance_quote_requests WHERE loan_id=? AND provider_id=? AND quote_type=?', [loanId, providerId, quoteType]);
    version = Math.max(version, Number(v.v) + 1);
    const [ins] = await conn.query('INSERT INTO insurance_quote_requests SET ?', {
      quote_type: quoteType, loan_id: loanId, organization_id: snapshot.organizationId || 1, provider_id: providerId, version,
      status: 'requested', snapshot_json: JSON.stringify(snapshot),
      requested_by_mlo_id: user?.id || null, requested_by: user?.name || user?.email || user?.username || null,
      disclosed_to_borrower: disclosed ? 1 : 0, disclosure_text_version: disclosed ? DISCLOSURE_VERSION : null,
    });
    const requestNo = `IR-${pad6(ins.insertId)}`;
    await conn.query('UPDATE insurance_quote_requests SET request_no=? WHERE id=?', [requestNo, ins.insertId]);
    await conn.query('INSERT INTO data_share_audit SET ?', {
      loan_id: loanId, provider_id: providerId, request_id: ins.insertId, purpose: `${quoteType}_quote`,
      fields_shared: JSON.stringify(SHARED_FIELDS), shared_by: user?.name || user?.email || null, shared_by_mlo_id: user?.id || null, ip: ip || null,
    });
    await conn.commit();
    const [[request]] = await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [ins.insertId]);
    return { request, created: true };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

/** Provider submits (or revises) a quote. Previous 'quoted' rows on the request become 'superseded'. */
async function submitQuote({ request, body, user, estimate }) {
  const annual = Number(body.annualPremium);
  if (!Number.isFinite(annual) || annual <= 0) { const e = new Error('Annual premium is required'); e.status = 422; throw e; }
  const monthly = body.monthlyPremium != null && body.monthlyPremium !== '' ? Number(body.monthlyPremium) : Math.round(annual / 12 * 100) / 100;
  const num = v => (v === undefined || v === null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
  const validUntil = body.validUntil || new Date(Date.now() + DEFAULT_VALID_DAYS * 86400000).toISOString().slice(0, 10);
  if (validUntil < today()) { const e = new Error('Valid-until date is in the past'); e.status = 422; throw e; }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[c]] = await conn.query('SELECT COUNT(*) AS n FROM insurance_quotes WHERE request_id=?', [request.id]);
    const revision = Number(c.n) + 1;
    await conn.query(`UPDATE insurance_quotes SET status='superseded' WHERE request_id=? AND status IN ('quoted','expired')`, [request.id]);
    const quoteId = `IQ-${pad6(request.id)}-${letter(revision)}`;
    const [ins] = await conn.query('INSERT INTO insurance_quotes SET ?', {
      quote_id: quoteId, quote_type: request.quote_type, request_id: request.id, loan_id: request.loan_id, provider_id: request.provider_id, revision,
      status: 'quoted', annual_premium: annual, monthly_premium: monthly,
      dwelling_coverage: num(body.dwelling), other_structures: num(body.otherStructures), personal_property: num(body.personalProperty), liability: num(body.liability),
      deductible_all_peril: num(body.deductibleAllPeril), wind_hail_deductible_pct: num(body.windHailPct), flood_separate: body.floodSeparate ? 1 : 0,
      carrier_product: body.carrierProduct ? String(body.carrierProduct).slice(0, 120) : null,
      effective_date: body.effectiveDate || null, valid_until: validUntil, notes: body.notes ? String(body.notes).slice(0, 4000) : null,
      pdf: body.pdfBase64 ? Buffer.from(String(body.pdfBase64).replace(/^data:.*?;base64,/, ''), 'base64') : null,
      pdf_file_name: body.pdfFileName ? String(body.pdfFileName).slice(0, 255) : null,
      estimate_json: estimate ? JSON.stringify(estimate) : null,
      submitted_by_user_id: user?.id || null, submitted_by: user?.name || user?.username || null,
    });
    await conn.query(`UPDATE insurance_quote_requests SET status='quoted' WHERE id=?`, [request.id]);
    await conn.commit();
    const [[q]] = await db.query('SELECT * FROM insurance_quotes WHERE id=?', [ins.insertId]);
    return q;
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

/** Expiry is a view, not a stored transition. */
function effectiveQuoteStatus(q) {
  if (q.status === 'quoted' && q.valid_until && ymd(q.valid_until) < today()) return 'expired';
  return q.status;
}
function effectiveRequestStatus(r, quotes) {
  if (r.status === 'quoted') {
    const latest = quotes.find(q => q.revision === Math.max(...quotes.map(x => x.revision)));
    if (latest) { const s = effectiveQuoteStatus(latest); if (s === 'expired') return 'expired'; if (['accepted', 'declined', 'not_selected'].includes(s)) return s; }
  }
  return r.status;
}
/** A not-selected quote can still be chosen while it is valid (the borrower may change their mind). */
const canReselect = q => q.status === 'not_selected' && q.valid_until && ymd(q.valid_until) >= today();

const quoteView = (q, { withEstimate = false, side = 'mlo' } = {}) => ({
  id: q.id, quote_id: q.quote_id, quote_type: q.quote_type, request_id: q.request_id, revision: q.revision,
  // The provider sees one closed state for "someone else won" and "borrower said no".
  status: side === 'provider' && effectiveQuoteStatus(q) === 'declined' ? 'not_selected' : effectiveQuoteStatus(q), stored_status: q.status,
  can_reselect: side !== 'provider' && canReselect(q),
  annual_premium: Number(q.annual_premium), monthly_premium: Number(q.monthly_premium),
  dwelling_coverage: q.dwelling_coverage != null ? Number(q.dwelling_coverage) : null, other_structures: q.other_structures != null ? Number(q.other_structures) : null,
  personal_property: q.personal_property != null ? Number(q.personal_property) : null, liability: q.liability != null ? Number(q.liability) : null,
  deductible_all_peril: q.deductible_all_peril != null ? Number(q.deductible_all_peril) : null, wind_hail_deductible_pct: q.wind_hail_deductible_pct != null ? Number(q.wind_hail_deductible_pct) : null,
  flood_separate: !!q.flood_separate, carrier_product: q.carrier_product, effective_date: ymd(q.effective_date), valid_until: ymd(q.valid_until), notes: q.notes,
  has_pdf: !!q.has_pdf, pdf_file_name: q.pdf_file_name,
  submitted_by: q.submitted_by, submitted_at: q.submitted_at,
  decided_at: q.decided_at, decided_by_type: q.decided_by_type,
  ...(side !== 'provider' ? { decided_by: q.decided_by, decided_by_name: q.decided_by_name, on_behalf_note: q.on_behalf_note, decline_reason: q.decline_reason } : {}),
  ...(side === 'mlo' ? { hidden_at: q.hidden_at, hidden_reason: q.hidden_reason } : {}),
  ...(withEstimate && q.estimate_json ? { estimate: safeJson(q.estimate_json) } : {}),
});
const safeJson = v => { try { return JSON.parse(v); } catch { return null; } };

const QUOTE_COLS = `id, quote_id, quote_type, request_id, loan_id, provider_id, revision, status, annual_premium, monthly_premium, dwelling_coverage, other_structures, personal_property, liability,
  deductible_all_peril, wind_hail_deductible_pct, flood_separate, carrier_product, effective_date, valid_until, notes, (pdf IS NOT NULL) AS has_pdf, pdf_file_name, estimate_json,
  submitted_by_user_id, submitted_by, submitted_at, decided_by, decided_by_type, decided_by_name, on_behalf_note, decided_at, decline_reason, hidden_at, hidden_reason, hidden_by_mlo_id, borrower_notified_at`;

/**
 * One request as both portals render it. `side` decides what the other party's
 * unread count means and whether the estimate rides along.
 */
async function requestView(r, { side, withMessages = false } = {}) {
  const [quotes] = await db.query(`SELECT ${QUOTE_COLS} FROM insurance_quotes WHERE request_id=? ORDER BY revision DESC`, [r.id]);
  const [[prov]] = await db.query('SELECT id, code, name, notification_email FROM insurance_providers WHERE id=?', [r.provider_id]);
  const [[mlo]] = r.requested_by_mlo_id
    ? await db.query('SELECT u.id, u.email, u.first_nm, u.last_nm, u.phone, o.name AS org_name FROM mlo_users u LEFT JOIN organizations o ON o.id=u.organization_id WHERE u.id=?', [r.requested_by_mlo_id])
    : [[null]];
  // Two threads per request: provider channel (MLO <-> agent) and borrower channel (borrower <-> MLO).
  const myChannel = side === 'borrower' ? 'borrower' : 'provider';
  const [[unread]] = await db.query(`SELECT COUNT(*) AS n FROM quote_messages WHERE request_id=? AND channel=? AND read_at IS NULL AND sender_type<>?`, [r.id, myChannel, side]);
  const [[total]] = await db.query('SELECT COUNT(*) AS n FROM quote_messages WHERE request_id=? AND channel=?', [r.id, myChannel]);
  const snapshot = safeJson(r.snapshot_json) || {};
  const visibleQuotes = side === 'borrower' ? quotes.filter(q => !q.hidden_at) : quotes;
  const view = {
    id: r.id, request_no: r.request_no, quote_type: r.quote_type, loan_id: r.loan_id, version: r.version,
    status: effectiveRequestStatus(r, quotes), stored_status: r.status,
    provider: prov ? { id: prov.id, code: prov.code, name: prov.name } : null,
    mlo: mlo ? { id: mlo.id, name: [mlo.first_nm, mlo.last_nm].filter(Boolean).join(' ') || mlo.email, email: mlo.email, phone: mlo.phone, company: mlo.org_name || null } : { name: r.requested_by },
    snapshot, disclosed_to_borrower: !!r.disclosed_to_borrower,
    requested_at: r.requested_at, viewed_at: r.viewed_at, closed_at: r.closed_at, close_reason: r.close_reason,
    quotes: visibleQuotes.map(q => quoteView(q, { withEstimate: side === 'provider', side })),
    latest_quote: visibleQuotes[0] ? quoteView(visibleQuotes[0], { withEstimate: side === 'provider', side }) : null,
    messages_total: Number(total.n), messages_unread: Number(unread.n),
  };
  if (side === 'mlo') {
    const [[bu]] = await db.query(`SELECT COUNT(*) AS n FROM quote_messages WHERE request_id=? AND channel='borrower' AND read_at IS NULL AND sender_type='borrower'`, [r.id]);
    const [[bt]] = await db.query(`SELECT COUNT(*) AS n FROM quote_messages WHERE request_id=? AND channel='borrower'`, [r.id]);
    view.borrower_messages_total = Number(bt.n); view.borrower_messages_unread = Number(bu.n);
  }
  if (withMessages) {
    const [msgs] = await db.query('SELECT id, sender_type, sender_name, body, created_at, read_at FROM quote_messages WHERE request_id=? AND channel=? ORDER BY id', [r.id, myChannel]);
    view.messages = msgs;
    if (side === 'mlo') {
      const [bm] = await db.query(`SELECT id, sender_type, sender_name, body, created_at, read_at FROM quote_messages WHERE request_id=? AND channel='borrower' ORDER BY id`, [r.id]);
      view.borrower_messages = bm;
    }
  }
  return view;
}

async function markMessagesRead(requestId, side, channel) {
  const ch = channel || (side === 'borrower' ? 'borrower' : 'provider');
  await db.query('UPDATE quote_messages SET read_at=NOW() WHERE request_id=? AND channel=? AND read_at IS NULL AND sender_type<>?', [requestId, ch, side]);
}

// ── the borrower's decision ──────────────────────────────────────────────
const byInfo = by => ({ decided_by: by.id || null, decided_by_type: by.type, decided_by_name: by.name || null });

/**
 * decideQuote({ quoteId, decision: 'accepted' | 'declined', by: {type, id, name}, reason, onBehalfNote })
 * Returns { quote, request, notSelected: [{quote, request}], hoi } — the caller sends the e-mails.
 */
async function decideQuote({ quoteId, decision, by, reason, onBehalfNote }) {
  const [[q]] = await db.query(`SELECT ${QUOTE_COLS} FROM insurance_quotes WHERE id=?`, [quoteId]);
  if (!q) { const e = new Error('Quote not found'); e.status = 404; throw e; }
  const [[r]] = await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [q.request_id]);
  const st = effectiveQuoteStatus(q);
  if (decision === 'accepted') {
    if (st === 'expired' || (q.valid_until && ymd(q.valid_until) < today())) { const e = new Error('This quote has expired — ask the provider for a fresh one'); e.status = 409; throw e; }
    if (!['quoted', 'not_selected', 'declined'].includes(st)) { const e = new Error(`Quote is ${st}`); e.status = 409; throw e; }
    if (q.hidden_at) { const e = new Error('This quote is hidden from the borrower'); e.status = 409; throw e; }
  } else if (decision === 'declined') {
    if (!['quoted', 'accepted', 'not_selected'].includes(st)) { const e = new Error(`Quote is ${st}`); e.status = 409; throw e; }
  } else { const e = new Error('decision must be accepted or declined'); e.status = 422; throw e; }

  const conn = await db.getConnection();
  const notSelected = [];
  try {
    await conn.beginTransaction();
    const stamp = { ...byInfo(by), on_behalf_note: by.type === 'mlo' ? (onBehalfNote || null) : null };   // decided_at is set with NOW() below (same clock as every other timestamp)
    if (decision === 'accepted') {
      // Every other live quote on this loan (same type) steps aside — reversible while still valid.
      const [others] = await conn.query(
        `SELECT ${QUOTE_COLS} FROM insurance_quotes WHERE loan_id=? AND quote_type=? AND id<>? AND status IN ('quoted','accepted') FOR UPDATE`, [q.loan_id, q.quote_type, q.id]);
      for (const o of others) {
        await conn.query('UPDATE insurance_quotes SET status=\'not_selected\', decided_at=NOW(), decided_by_type=?, decided_by_name=? WHERE id=?', [by.type, by.name || null, o.id]);
        await conn.query(`UPDATE insurance_quote_requests SET status='not_selected', closed_at=NOW(), close_reason='The borrower chose another quote' WHERE id=?`, [o.request_id]);
        const [[orq]] = await conn.query('SELECT * FROM insurance_quote_requests WHERE id=?', [o.request_id]);
        notSelected.push({ quote: o, request: orq });
      }
      await conn.query('UPDATE insurance_quotes SET status=\'accepted\', decline_reason=NULL, decided_at=NOW(), ? WHERE id=?', [stamp, q.id]);
      await conn.query(`UPDATE insurance_quote_requests SET status='accepted', closed_at=NOW(), close_reason=NULL WHERE id=?`, [r.id]);
      // The official figure: premium into the loan, locked.
      const note = `${q.quote_id} accepted by ${by.name || (by.type === 'mlo' ? 'loan officer' : 'borrower')}${by.type === 'mlo' ? ' (on the borrower\'s behalf)' : ''} on ${today()}`;
      await conn.query('UPDATE loans SET pmt_hoi=?, pmt_hoi_source=\'quote\', pmt_hoi_locked_at=NOW(), pmt_hoi_note=?, hoi_quote_id=? WHERE id=?', [Number(q.monthly_premium), note.slice(0, 255), q.id, q.loan_id]);
      await conn.query('INSERT INTO hoi_log SET ?', { loan_id: q.loan_id, event: 'quote_accepted', amount: Number(q.monthly_premium), quote_id: q.id, note: note.slice(0, 255), by_type: by.type, by_id: by.id || null, by_name: by.name || null });
    } else {
      const wasAccepted = q.status === 'accepted';
      await conn.query('UPDATE insurance_quotes SET status=\'declined\', decline_reason=?, decided_at=NOW(), ? WHERE id=?', [reason ? String(reason).slice(0, 1000) : null, stamp, q.id]);
      await conn.query(`UPDATE insurance_quote_requests SET status='declined', closed_at=NOW(), close_reason=? WHERE id=?`, ['Declined by the borrower', r.id]);
      if (wasAccepted) {
        // The chosen quote was dropped without a replacement: the figure is unofficial again.
        await conn.query('UPDATE loans SET pmt_hoi_source=\'estimate\', pmt_hoi_locked_at=NULL, pmt_hoi_note=?, hoi_quote_id=NULL WHERE id=?', [`${q.quote_id} declined by ${by.name || 'borrower'} on ${today()} — back to the market estimate`, q.loan_id]);
        await conn.query('INSERT INTO hoi_log SET ?', { loan_id: q.loan_id, event: 'cleared', amount: Number(q.monthly_premium), quote_id: q.id, note: `${q.quote_id} declined after acceptance`, by_type: by.type, by_id: by.id || null, by_name: by.name || null });
      }
    }
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
  if (decision === 'declined' && q.status === 'accepted') await applyEstimateIfBlank(q.loan_id);   // refresh the amount now that the source is 'estimate' again
  const [[quote]] = await db.query(`SELECT ${QUOTE_COLS} FROM insurance_quotes WHERE id=?`, [q.id]);
  const [[request]] = await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [r.id]);
  return { quote, request, notSelected, hoi: await hoiView(q.loan_id) };
}

async function hideQuote(quoteId, { reason, user }) {
  await db.query('UPDATE insurance_quotes SET hidden_at=NOW(), hidden_reason=?, hidden_by_mlo_id=? WHERE id=? AND status IN (\'quoted\',\'not_selected\')', [reason ? String(reason).slice(0, 255) : null, user?.id || null, quoteId]);
}
async function unhideQuote(quoteId) {
  await db.query('UPDATE insurance_quotes SET hidden_at=NULL, hidden_reason=NULL, hidden_by_mlo_id=NULL WHERE id=?', [quoteId]);
}

// ── the homeowners-insurance figure on the loan ───────────────────────────
async function hoiView(loanId) {
  const [[l]] = await db.query('SELECT pmt_hoi, pmt_hoi_source, pmt_hoi_locked_at, pmt_hoi_note, hoi_quote_id FROM loans WHERE id=?', [loanId]);
  if (!l) return null;
  let quote = null;
  if (l.hoi_quote_id) { const [[q]] = await db.query('SELECT quote_id, annual_premium, monthly_premium, carrier_product, provider_id FROM insurance_quotes WHERE id=?', [l.hoi_quote_id]); quote = q || null; }
  return { amount: l.pmt_hoi != null ? Number(l.pmt_hoi) : null, source: l.pmt_hoi_source || (l.pmt_hoi ? 'manual' : null), locked: !!l.pmt_hoi_locked_at, locked_at: l.pmt_hoi_locked_at, note: l.pmt_hoi_note, quote_id: quote?.quote_id || null, hoi_quote_pk: l.hoi_quote_id || null };
}

/** The market estimate for the loan's property, or null when state/ZIP are not usable yet. */
async function estimateForLoan(loanId) {
  const snap = await snapshotFor(loanId);
  if (!snap || !stateCode(snap.property.state)) return null;
  const est = await rates.estimate({ zip: snap.property.zip, state: snap.property.state });
  return est ? { ...est, zip: snap.property.zip, state: stateCode(snap.property.state) } : null;
}

/**
 * Put the unofficial figure on the loan when there is none, or refresh it when the current figure
 * is itself an estimate. Never touches a locked figure or one typed by the MLO / read from a file.
 */
async function applyEstimateIfBlank(loanId, { user } = {}) {
  const [[l]] = await db.query('SELECT pmt_hoi, pmt_hoi_source, pmt_hoi_locked_at FROM loans WHERE id=?', [loanId]);
  if (!l) return { applied: false, reason: 'no loan' };
  if (l.pmt_hoi_locked_at) return { applied: false, reason: 'locked' };
  const blank = l.pmt_hoi == null || Number(l.pmt_hoi) === 0;
  if (!blank && l.pmt_hoi_source !== 'estimate') return { applied: false, reason: l.pmt_hoi_source || 'manual' };
  const est = await estimateForLoan(loanId);
  if (!est) return { applied: false, reason: 'no state/zip' };
  const monthly = Math.round(est.annualPremium / 12 * 100) / 100;
  if (!blank && l.pmt_hoi_source === 'estimate' && Number(l.pmt_hoi) === monthly) return { applied: false, reason: 'unchanged', amount: monthly, estimate: est };
  const note = `Market estimate for ZIP ${est.zip || '—'} (${est.regionLabel}) — unofficial until a quote is accepted`;
  await db.query('UPDATE loans SET pmt_hoi=?, pmt_hoi_source=\'estimate\', pmt_hoi_note=? WHERE id=?', [monthly, note.slice(0, 255), loanId]);
  await db.query('INSERT INTO hoi_log SET ?', { loan_id: loanId, event: 'estimate', amount: monthly, note: note.slice(0, 255), by_type: user ? 'mlo' : 'system', by_id: user?.id || null, by_name: user?.name || null });
  return { applied: true, amount: monthly, estimate: est };
}

/** MLO types a figure (or a MISMO file brings one): only while not locked. */
async function setHoiManual(loanId, { amount, source = 'manual', user, note }) {
  const [[l]] = await db.query('SELECT pmt_hoi_locked_at FROM loans WHERE id=?', [loanId]);
  if (!l) return false;
  if (l.pmt_hoi_locked_at) return false;
  await db.query('UPDATE loans SET pmt_hoi=?, pmt_hoi_source=?, pmt_hoi_note=? WHERE id=?', [amount, source, note || null, loanId]);
  await db.query('INSERT INTO hoi_log SET ?', { loan_id: loanId, event: source === 'file' ? 'file' : 'manual', amount, note: note || null, by_type: user ? 'mlo' : 'system', by_id: user?.id || null, by_name: user?.name || null });
  return true;
}

async function unlockHoi(loanId, { reason, user }) {
  if (!reason || !String(reason).trim()) { const e = new Error('A reason is required to unlock the figure'); e.status = 422; throw e; }
  const [[l]] = await db.query('SELECT pmt_hoi, pmt_hoi_locked_at, hoi_quote_id FROM loans WHERE id=?', [loanId]);
  if (!l || !l.pmt_hoi_locked_at) return await hoiView(loanId);
  const note = `Unlocked by ${user?.name || 'loan officer'} on ${today()}: ${String(reason).trim()}`;
  await db.query('UPDATE loans SET pmt_hoi_source=\'manual\', pmt_hoi_locked_at=NULL, pmt_hoi_note=?, hoi_quote_id=NULL WHERE id=?', [note.slice(0, 255), loanId]);
  await db.query('INSERT INTO hoi_log SET ?', { loan_id: loanId, event: 'unlocked', amount: l.pmt_hoi, quote_id: l.hoi_quote_id, note: note.slice(0, 255), by_type: 'mlo', by_id: user?.id || null, by_name: user?.name || null });
  return await hoiView(loanId);
}

// ── borrower accounts on a loan (for notifications and the borrower view) ──
async function borrowerAccounts(loanId) {
  const [rows] = await db.query(
    `SELECT b.id, b.email, b.first_nm, b.last_nm, b.preferred_lang, lb.role, lb.slot FROM loan_borrowers lb JOIN borrower_users b ON b.id=lb.borrower_user_id
      WHERE lb.loan_id=? AND b.is_active=1 ORDER BY lb.slot`, [loanId]);
  return rows.map(b => ({ id: b.id, email: b.email, name: [b.first_nm, b.last_nm].filter(Boolean).join(' ') || b.email, role: b.role, slot: b.slot, lang: b.preferred_lang || 'en' }));
}

/** Everything the borrower portal shows for one loan. */
async function borrowerView(loanId, { role }) {
  const [rows] = await db.query('SELECT * FROM insurance_quote_requests WHERE loan_id=? ORDER BY id DESC', [loanId]);
  const requests = [];
  for (const r of rows) requests.push(await requestView(r, { side: 'borrower', withMessages: true }));
  const hoi = await hoiView(loanId);
  const accepted = requests.flatMap(r => r.quotes).find(q => q.status === 'accepted') || null;
  const waiting = requests.filter(r => ['requested', 'viewed'].includes(r.status));
  const unread = requests.reduce((a, r) => a + r.messages_unread, 0);
  return { requests, hoi, accepted, waiting: waiting.length, can_decide: role === 'primary', badge: requests.filter(r => r.latest_quote && r.latest_quote.status === 'quoted').length + unread };
}

module.exports = {
  DISCLOSURE_VERSION, DISCLOSURE_TEXT, SHARED_FIELDS, DEFAULT_VALID_DAYS, QUOTE_COLS,
  loadLoan, snapshotFor, readiness, openRequest, createRequest, submitQuote,
  effectiveQuoteStatus, effectiveRequestStatus, quoteView, requestView, markMessagesRead, seatLabel,
  decideQuote, hideQuote, unhideQuote, hoiView, estimateForLoan, applyEstimateIfBlank, setHoiManual, unlockHoi, borrowerAccounts, borrowerView,
};
