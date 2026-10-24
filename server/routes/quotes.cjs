'use strict';
/**
 * server/routes/quotes.cjs — MLO side of the quote flow (mounted at /api/quotes, role mlo).
 *
 *   GET  /providers                      active providers (for the checkboxes)
 *   GET  /loan/:loanId                   readiness + requests (with quotes, message counts) + what pmt_hoi came from
 *   POST /request/:loanId                { providerIds:[..], quoteType?, disclosed:true, supersede?:bool }
 *   POST /request/:id/withdraw           { reason? }
 *   GET  /request/:id                    one request with messages (marks provider messages read)
 *   POST /request/:id/messages           { body }
 *   POST /request/:id/borrower-messages  { body }   MLO answers the borrower in the borrower thread (provider never sees it)
 *   POST /request/:id/borrower-read      marks the borrower's messages read
 *   POST /quote/:id/decision             { decision:'accepted'|'declined', onBehalfNote, reason }
 *                                        the MLO records the BORROWER's decision on their behalf (phone, in person…)
 *   POST /quote/:id/hide | /unhide       { reason }  keep a quote away from the borrower
 *   GET  /quote/:id/pdf
 *   GET  /hoi/:loanId                    the homeowners-insurance figure (source, lock, note); fills the market
 *                                        estimate in when the loan has none
 *   POST /hoi/:loanId/unlock             { reason }
 *   GET  /disclosure                     the disclosure text + version the checkbox attests to
 *
 * The borrower decides. The MLO no longer accepts or declines — only records
 * a decision the borrower gave outside the portal. Everything the provider
 * sees is the snapshot taken here; the MLO never sees the provider's estimate.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const Q       = require('../lib/quotes.cjs');
const email   = require('../lib/email.cjs');
const notify  = require('../lib/quote-notify.cjs');

const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers['x-real-ip'] || '').trim() || req.ip || null;
const who = req => ({ id: req.user?.id, name: req.user?.name || [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' '), email: req.user?.email, username: req.user?.username });

async function loadRequest(id) {
  const [[r]] = await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [Number(id)]);
  return r || null;
}
async function loadQuote(id) {
  const [[q]] = await db.query(`SELECT ${Q.QUOTE_COLS} FROM insurance_quotes WHERE id=?`, [Number(id)]);
  return q || null;
}
const portalUrl = () => `${email.BASE_URL()}/insurance`;
const crmUrl = loanId => `${email.BASE_URL()}/?loan=${loanId}&tab=quotes`;

router.get('/disclosure', (req, res) => res.json({ version: Q.DISCLOSURE_VERSION, text: Q.DISCLOSURE_TEXT, fields: Q.SHARED_FIELDS }));

router.get('/providers', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, code, name, quote_types FROM insurance_providers WHERE is_active=1 ORDER BY name');
    res.json(rows.map(r => ({ ...r, quote_types: String(r.quote_types || 'insurance').split(',').map(x => x.trim()) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/loan/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const snapshot = await Q.snapshotFor(loanId);
    if (!snapshot) return res.status(404).json({ error: 'Loan not found' });
    const [rows] = await db.query('SELECT * FROM insurance_quote_requests WHERE loan_id=? ORDER BY id DESC', [loanId]);
    const requests = [];
    for (const r of rows) requests.push(await Q.requestView(r, { side: 'mlo', withMessages: true }));   // threads are shown inline
    await Q.applyEstimateIfBlank(loanId).catch(() => null);
    const hoi = await Q.hoiView(loanId);
    const borrowers = await Q.borrowerAccounts(loanId);
    const newQuotes = requests.filter(r => r.status === 'quoted').length;
    const unread = requests.reduce((a, r) => a + r.messages_unread + (r.borrower_messages_unread || 0), 0);
    res.json({ snapshot, readiness: { ready: Q.readiness(snapshot).length === 0, problems: Q.readiness(snapshot) }, requests, hoi,
      borrowers: borrowers.map(b => ({ name: b.name, role: b.role, slot: b.slot })),   // who can decide in the portal (no e-mails to the UI)
      badge: newQuotes + unread, disclosure: { version: Q.DISCLOSURE_VERSION, text: Q.DISCLOSURE_TEXT } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/request/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const body = req.body || {};
    const quoteType = body.quoteType === 'title' ? 'title' : 'insurance';
    const snapshot = await Q.snapshotFor(loanId);
    if (!snapshot) return res.status(404).json({ error: 'Loan not found' });
    const problems = Q.readiness(snapshot);
    if (problems.length) return res.status(422).json({ error: 'The loan is missing information needed for a quote', problems });
    if (!body.disclosed) return res.status(422).json({ error: 'Confirm the borrower has been told their name and property address will be shared.' });
    const ids = (Array.isArray(body.providerIds) ? body.providerIds : []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(422).json({ error: 'Pick at least one provider' });
    const [provs] = await db.query('SELECT * FROM insurance_providers WHERE is_active=1 AND id IN (?)', [ids]);
    if (provs.length !== ids.length) return res.status(422).json({ error: 'Unknown or inactive provider' });

    const results = [];
    for (const p of provs) {
      const r = await Q.createRequest({ loanId, providerId: p.id, quoteType, snapshot, user: who(req), ip: clientIp(req), disclosed: true, supersede: !!body.supersede });
      results.push({ provider: { id: p.id, code: p.code, name: p.name }, request_no: r.request.request_no, created: !!r.created, skipped: r.skipped || null });
      if (r.created && p.notification_email) {
        const names = snapshot.borrowers.map(b => `${b.firstName} ${b.lastName}`).join(' and ');
        email.sendNotice({ to: p.notification_email, type: 'quote_request', loanId, subject: `New ${quoteType} quote request ${r.request.request_no} - loan ${snapshot.loanNumber}`,
          title: `New quote request ${r.request.request_no}`,
          lines: [`${who(req).name || 'A loan officer'} asked ${p.name} for a${quoteType === 'insurance' ? 'n insurance' : ' title'} quote on loan ${snapshot.loanNumber} for ${names}.`,
                  `Property: ${[snapshot.property.street, snapshot.property.unit, snapshot.property.city, snapshot.property.state, snapshot.property.zip].filter(Boolean).join(', ')}.`,
                  'Sign in to the quote portal to review it and submit your quote.'],
          buttonLabel: 'Open the quote portal', buttonUrl: portalUrl(), replyTo: who(req).email }).catch(() => {});
      }
    }
    const [rows] = await db.query('SELECT * FROM insurance_quote_requests WHERE loan_id=? ORDER BY id DESC', [loanId]);
    const requests = []; for (const r of rows) requests.push(await Q.requestView(r, { side: 'mlo' }));
    res.status(201).json({ ok: true, results, requests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/request/:id/withdraw', async (req, res) => {
  try {
    const r = await loadRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (!['requested', 'viewed', 'quoted'].includes(r.status)) return res.status(409).json({ error: `Request is already ${r.status}` });
    await db.query(`UPDATE insurance_quote_requests SET status='withdrawn', closed_at=NOW(), close_reason=? WHERE id=?`, [String(req.body?.reason || 'Withdrawn by loan officer').slice(0, 255), r.id]);
    await db.query(`UPDATE insurance_quotes SET status='superseded' WHERE request_id=? AND status='quoted'`, [r.id]);
    res.json({ ok: true, request: await Q.requestView(await loadRequest(r.id), { side: 'mlo' }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/request/:id', async (req, res) => {
  try {
    const r = await loadRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    await Q.markMessagesRead(r.id, 'mlo');
    res.json(await Q.requestView(r, { side: 'mlo', withMessages: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/request/:id/messages', async (req, res) => {
  try {
    const r = await loadRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    const body = String(req.body?.body || '').trim().slice(0, 4000);
    if (!body) return res.status(422).json({ error: 'Message is empty' });
    await db.query('INSERT INTO quote_messages SET ?', { request_id: r.id, sender_type: 'mlo', sender_id: req.user?.id || null, sender_name: who(req).name || who(req).email, body });
    const [[p]] = await db.query('SELECT name, notification_email FROM insurance_providers WHERE id=?', [r.provider_id]);
    if (p?.notification_email) email.sendNotice({ to: p.notification_email, type: 'quote_message', loanId: r.loan_id, subject: `Message on ${r.request_no} from ${who(req).name || 'the loan officer'}`,
      title: `New message on ${r.request_no}`, lines: [`${who(req).name || 'The loan officer'} wrote:`, body], buttonLabel: 'Reply in the quote portal', buttonUrl: portalUrl(), replyTo: who(req).email }).catch(() => {});
    res.status(201).json(await Q.requestView(r, { side: 'mlo', withMessages: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// The MLO records a decision the borrower gave outside the portal (phone, e-mail, in person).
router.post('/quote/:id/decision', async (req, res) => {
  try {
    const q = await loadQuote(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    const decision = req.body?.decision === 'accepted' ? 'accepted' : req.body?.decision === 'declined' ? 'declined' : null;
    if (!decision) return res.status(422).json({ error: 'decision must be accepted or declined' });
    const onBehalfNote = String(req.body?.onBehalfNote || '').trim().slice(0, 255);
    if (!onBehalfNote) return res.status(422).json({ error: 'Say how the borrower gave this decision (e.g. "By phone with Ana, 10/24")' });
    const result = await Q.decideQuote({ quoteId: q.id, decision, by: { type: 'mlo', id: req.user?.id, name: who(req).name || who(req).email }, reason: req.body?.reason, onBehalfNote });
    notify.decision({ loanId: q.loan_id, decisionType: decision, result, by: { type: 'mlo', name: who(req).name } }).catch(() => {});
    res.json({ ok: true, hoi: result.hoi, request: await Q.requestView(result.request, { side: 'mlo', withMessages: true }) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/quote/:id/hide', async (req, res) => {
  try {
    const q = await loadQuote(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    const reason = String(req.body?.reason || '').trim().slice(0, 255);
    if (!reason) return res.status(422).json({ error: 'A reason is required (the borrower will not see this quote)' });
    await Q.hideQuote(q.id, { reason, user: req.user });
    res.json({ ok: true, request: await Q.requestView(await loadRequest(q.request_id), { side: 'mlo', withMessages: true }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/quote/:id/unhide', async (req, res) => {
  try {
    const q = await loadQuote(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    await Q.unhideQuote(q.id);
    res.json({ ok: true, request: await Q.requestView(await loadRequest(q.request_id), { side: 'mlo', withMessages: true }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Borrower thread (channel 'borrower'): the MLO's replies; the provider never sees this channel.
router.post('/request/:id/borrower-messages', async (req, res) => {
  try {
    const r = await loadRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    const body = String(req.body?.body || '').trim().slice(0, 4000);
    if (!body) return res.status(422).json({ error: 'Message is empty' });
    await db.query('INSERT INTO quote_messages SET ?', { request_id: r.id, channel: 'borrower', sender_type: 'mlo', sender_id: req.user?.id || null, sender_name: who(req).name || who(req).email, body });
    notify.mloMessageToBorrowers({ loanId: r.loan_id, request: r, body, mloName: who(req).name || 'Your loan officer' }).catch(() => {});
    res.status(201).json(await Q.requestView(r, { side: 'mlo', withMessages: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/request/:id/borrower-read', async (req, res) => {
  try { await Q.markMessagesRead(Number(req.params.id), 'mlo', 'borrower'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// The homeowners-insurance figure on the loan. GET fills in the market estimate when the loan has none.
router.get('/hoi/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const applied = await Q.applyEstimateIfBlank(loanId, { user: who(req) });
    const hoi = await Q.hoiView(loanId);
    if (!hoi) return res.status(404).json({ error: 'Loan not found' });
    res.json({ ...hoi, applied: !!applied.applied, estimate: applied.estimate || (await Q.estimateForLoan(loanId).catch(() => null)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/hoi/:loanId/unlock', async (req, res) => {
  try { res.json(await Q.unlockHoi(Number(req.params.loanId), { reason: req.body?.reason, user: who(req) })); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/quote/:id/pdf', async (req, res) => {
  try {
    const [[q]] = await db.query('SELECT pdf, pdf_file_name, quote_id FROM insurance_quotes WHERE id=?', [Number(req.params.id)]);
    if (!q || !q.pdf) return res.status(404).json({ error: 'No PDF on this quote' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(q.pdf_file_name || q.quote_id + '.pdf').replace(/"/g, '')}"`);
    res.send(q.pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
