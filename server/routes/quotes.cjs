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
 *   POST /quote/:id/accept               MLO accepts the quote (other quotes on the loan stay as they are)
 *   POST /quote/:id/decline              { reason }
 *   POST /quote/:id/use                  copies monthly premium to loans.pmt_hoi (+ hoi_quote_id)
 *   GET  /quote/:id/pdf
 *   GET  /disclosure                     the disclosure text + version the checkbox attests to
 *
 * Everything the provider sees is the snapshot taken here; the MLO never
 * sees the provider's estimate (it is stripped from quoteView on this side).
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const Q       = require('../lib/quotes.cjs');
const email   = require('../lib/email.cjs');

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
    for (const r of rows) requests.push(await Q.requestView(r, { side: 'mlo' }));
    const [[loan]] = await db.query('SELECT pmt_hoi, hoi_quote_id FROM loans WHERE id=?', [loanId]);
    const newQuotes = requests.filter(r => r.status === 'quoted').length;
    const unread = requests.reduce((a, r) => a + r.messages_unread, 0);
    res.json({ snapshot, readiness: { ready: Q.readiness(snapshot).length === 0, problems: Q.readiness(snapshot) }, requests,
      hoi: { pmt_hoi: loan?.pmt_hoi != null ? Number(loan.pmt_hoi) : null, hoi_quote_id: loan?.hoi_quote_id || null },
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

async function decide(req, res, status) {
  try {
    const q = await loadQuote(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    const eff = Q.effectiveQuoteStatus(q);
    if (eff !== 'quoted') return res.status(409).json({ error: `This quote is ${eff}` });
    const reason = status === 'declined' ? String(req.body?.reason || '').slice(0, 255) || null : null;
    await db.query('UPDATE insurance_quotes SET status=?, decided_by=?, decided_at=NOW(), decline_reason=? WHERE id=?', [status, who(req).name || who(req).email, reason, q.id]);
    await db.query('UPDATE insurance_quote_requests SET status=? WHERE id=?', [status, q.request_id]);
    const r = await loadRequest(q.request_id);
    const [[p]] = await db.query('SELECT name, notification_email FROM insurance_providers WHERE id=?', [r.provider_id]);
    if (p?.notification_email) email.sendNotice({ to: p.notification_email, type: `quote_${status}`, loanId: r.loan_id, subject: `Quote ${q.quote_id} ${status}`,
      title: `Quote ${q.quote_id} was ${status}`, lines: [`${who(req).name || 'The loan officer'} ${status} your quote on request ${r.request_no}.`, ...(reason ? [`Reason: ${reason}`] : [])],
      buttonLabel: 'Open the quote portal', buttonUrl: portalUrl(), replyTo: who(req).email }).catch(() => {});
    res.json({ ok: true, request: await Q.requestView(r, { side: 'mlo' }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
router.post('/quote/:id/accept',  (req, res) => decide(req, res, 'accepted'));
router.post('/quote/:id/decline', (req, res) => decide(req, res, 'declined'));

// Copy the accepted quote's monthly premium into the loan's proposed housing payment.
router.post('/quote/:id/use', async (req, res) => {
  try {
    const q = await loadQuote(req.params.id);
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    if (q.status !== 'accepted') return res.status(409).json({ error: 'Accept the quote first' });
    await db.query('UPDATE loans SET pmt_hoi=?, hoi_quote_id=? WHERE id=?', [Number(q.monthly_premium), q.id, q.loan_id]);
    res.json({ ok: true, pmt_hoi: Number(q.monthly_premium), hoi_quote_id: q.id, quote_id: q.quote_id });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
