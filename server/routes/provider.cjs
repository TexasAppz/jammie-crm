'use strict';
/**
 * server/routes/provider.cjs — the quote portal's API (mounted at /api/provider, role provider).
 *
 * Every query is scoped to req.user.providerId. A provider session cannot reach
 * any other /api/* prefix (auth.cjs ROLE_BY_PREFIX), and nothing here reads the
 * loan or 1003 tables — only the snapshot taken when the MLO sent the request.
 *
 *   GET  /summary                         counts per status for the inbox tabs
 *   GET  /requests?status=                inbox rows
 *   GET  /requests/:id                    full request: snapshot, MLO contact, estimate, quotes, messages (marks viewed)
 *   POST /requests/:id/quotes             submit or revise a quote
 *   POST /requests/:id/unable             { reason } — cannot quote this one
 *   POST /requests/:id/messages           { body }
 *   GET  /quotes/:id/pdf
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const Q       = require('../lib/quotes.cjs');
const rates   = require('../lib/hoi-rates.cjs');
const email   = require('../lib/email.cjs');

const who = req => ({ id: req.user?.id, name: req.user?.name || req.user?.username, username: req.user?.username, email: req.user?.email });
const crmUrl = loanId => `${email.BASE_URL()}/?loan=${loanId}&tab=quotes`;

/** The request, only if it belongs to this provider. */
async function own(req) {
  const [[r]] = await db.query('SELECT * FROM insurance_quote_requests WHERE id=? AND provider_id=?', [Number(req.params.id), req.user.providerId]);
  return r || null;
}
const INBOX = { new: ['requested'], viewed: ['viewed'], quoted: ['quoted'], decided: ['accepted', 'declined', 'declined_by_provider', 'withdrawn'], expired: ['expired'] };

router.get('/summary', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM insurance_quote_requests WHERE provider_id=? ORDER BY id DESC', [req.user.providerId]);
    const counts = { new: 0, viewed: 0, quoted: 0, decided: 0, expired: 0, unread_messages: 0 };
    for (const r of rows) {
      const v = await Q.requestView(r, { side: 'provider' });
      for (const [k, list] of Object.entries(INBOX)) if (list.includes(v.status)) counts[k]++;
      counts.unread_messages += v.messages_unread;
    }
    res.json({ provider: { id: req.user.providerId, code: req.user.providerCode, name: req.user.providerName }, counts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/requests', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM insurance_quote_requests WHERE provider_id=? ORDER BY id DESC LIMIT 500', [req.user.providerId]);
    const want = INBOX[req.query.status] || null;
    const out = [];
    for (const r of rows) {
      const v = await Q.requestView(r, { side: 'provider' });
      if (want && !want.includes(v.status)) continue;
      out.push(v);
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const r = await own(req);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (r.status === 'requested') await db.query(`UPDATE insurance_quote_requests SET status='viewed', viewed_at=NOW() WHERE id=? AND status='requested'`, [r.id]);
    await Q.markMessagesRead(r.id, 'provider');
    const fresh = (await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [r.id]))[0][0];
    const view = await Q.requestView(fresh, { side: 'provider', withMessages: true });
    const est = fresh.quote_type === 'insurance' ? await rates.estimate({ zip: view.snapshot?.property?.zip, state: view.snapshot?.property?.state }) : null;
    res.json({ ...view, estimate: est, defaults: { validDays: Q.DEFAULT_VALID_DAYS, effectiveDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/requests/:id/quotes', async (req, res) => {
  try {
    const r = await own(req);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (!['requested', 'viewed', 'quoted'].includes(r.status)) return res.status(409).json({ error: `This request is ${r.status.replace(/_/g, ' ')} — a new quote is not possible` });
    const view = await Q.requestView(r, { side: 'provider' });
    const est = r.quote_type === 'insurance' ? await rates.estimate({ zip: view.snapshot?.property?.zip, state: view.snapshot?.property?.state }) : null;
    const q = await Q.submitQuote({ request: r, body: req.body || {}, user: who(req), estimate: est });
    const fresh = (await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [r.id]))[0][0];
    const out = await Q.requestView(fresh, { side: 'provider', withMessages: true });
    if (out.mlo?.email) email.sendNotice({ to: out.mlo.email, type: q.revision > 1 ? 'quote_revised' : 'quote_submitted', loanId: r.loan_id,
      subject: `${req.user.providerName} ${q.revision > 1 ? 'revised' : 'submitted'} quote ${q.quote_id} - loan ${out.snapshot?.loanNumber || ''}`,
      title: `Quote ${q.quote_id} from ${req.user.providerName}`,
      lines: [`${who(req).name} ${q.revision > 1 ? 'revised the' : 'submitted a'} ${r.quote_type} quote on request ${r.request_no}: $${Number(q.monthly_premium).toFixed(2)} / month ($${Number(q.annual_premium).toFixed(2)} / year), valid until ${new Date(q.valid_until).toISOString().slice(0, 10)}.`,
              'Open the loan\'s Quotes tab to review, accept or decline it.'],
      buttonLabel: 'Open the loan', buttonUrl: crmUrl(r.loan_id), replyTo: who(req).email }).catch(() => {});
    res.status(201).json({ ...out, submitted: Q.quoteView(q, { withEstimate: true }) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/requests/:id/unable', async (req, res) => {
  try {
    const r = await own(req);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (!['requested', 'viewed'].includes(r.status)) return res.status(409).json({ error: `This request is ${r.status.replace(/_/g, ' ')}` });
    const reason = String(req.body?.reason || '').trim().slice(0, 255) || 'Unable to quote';
    await db.query(`UPDATE insurance_quote_requests SET status='declined_by_provider', closed_at=NOW(), close_reason=? WHERE id=?`, [reason, r.id]);
    const out = await Q.requestView((await db.query('SELECT * FROM insurance_quote_requests WHERE id=?', [r.id]))[0][0], { side: 'provider', withMessages: true });
    if (out.mlo?.email) email.sendNotice({ to: out.mlo.email, type: 'quote_unable', loanId: r.loan_id, subject: `${req.user.providerName} cannot quote ${r.request_no}`,
      title: `${req.user.providerName} cannot quote request ${r.request_no}`, lines: [`Reason: ${reason}`], buttonLabel: 'Open the loan', buttonUrl: crmUrl(r.loan_id), replyTo: who(req).email }).catch(() => {});
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/requests/:id/messages', async (req, res) => {
  try {
    const r = await own(req);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    const body = String(req.body?.body || '').trim().slice(0, 4000);
    if (!body) return res.status(422).json({ error: 'Message is empty' });
    await db.query('INSERT INTO quote_messages SET ?', { request_id: r.id, sender_type: 'provider', sender_id: req.user.id, sender_name: `${who(req).name} (${req.user.providerName})`, body });
    const out = await Q.requestView(r, { side: 'provider', withMessages: true });
    if (out.mlo?.email) email.sendNotice({ to: out.mlo.email, type: 'quote_message', loanId: r.loan_id, subject: `Message on ${r.request_no} from ${req.user.providerName}`,
      title: `New message on ${r.request_no}`, lines: [`${who(req).name} (${req.user.providerName}) wrote:`, body], buttonLabel: 'Reply in the loan\'s Quotes tab', buttonUrl: crmUrl(r.loan_id), replyTo: who(req).email }).catch(() => {});
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/quotes/:id/pdf', async (req, res) => {
  try {
    const [[q]] = await db.query('SELECT pdf, pdf_file_name, quote_id FROM insurance_quotes WHERE id=? AND provider_id=?', [Number(req.params.id), req.user.providerId]);
    if (!q || !q.pdf) return res.status(404).json({ error: 'No PDF on this quote' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(q.pdf_file_name || q.quote_id + '.pdf').replace(/"/g, '')}"`);
    res.send(q.pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
