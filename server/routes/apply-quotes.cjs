'use strict';
/**
 * server/routes/apply-quotes.cjs — the borrower's view of insurance quotes.
 * Mounted at /api/apply-quotes (lib/auth.cjs maps the /api/apply prefix to the 'borrower' role).
 *
 *   GET  /summary                            per loan: quotes received / waiting / accepted / badge (for the home screen)
 *   GET  /:loanId                            requests + quotes (hidden ones removed), my thread with the loan officer,
 *                                            the figure on the loan, whether I may decide (primary borrower only)
 *   POST /:loanId/quote/:id/decision         { decision:'accepted'|'declined', reason? }   primary borrower only
 *   POST /:loanId/request/:id/messages       { body }   a question for the loan officer (never reaches the provider)
 *   GET  /:loanId/quote/:id/pdf
 *
 * A borrower sees only loans that loan_borrowers links to them. Co-borrowers
 * see the same list and the primary's decision, read-only.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db.cjs');
const Q       = require('../lib/quotes.cjs');
const notify  = require('../lib/quote-notify.cjs');

async function seat(req, loanId) {
  const [[lb]] = await db.query('SELECT role, slot FROM loan_borrowers WHERE loan_id=? AND borrower_user_id=?', [loanId, req.user.id]);
  return lb || null;
}
const me = req => ({ type: 'borrower', id: req.user.id, name: req.user.name || req.user.email });

router.get('/summary', async (req, res) => {
  try {
    const [loans] = await db.query('SELECT loan_id, role FROM loan_borrowers WHERE borrower_user_id=?', [req.user.id]);
    const out = {};
    for (const l of loans) {
      const v = await Q.borrowerView(l.loan_id, { role: l.role });
      const received = v.requests.filter(r => r.latest_quote).length;
      out[l.loan_id] = { requested: v.requests.length, received, waiting: v.waiting, accepted: v.accepted ? v.accepted.quote_id : null, badge: v.badge, can_decide: v.can_decide };
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:loanId', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const lb = await seat(req, loanId);
    if (!lb) return res.status(404).json({ error: 'Application not found' });
    for (const r of (await db.query('SELECT id FROM insurance_quote_requests WHERE loan_id=?', [loanId]))[0]) await Q.markMessagesRead(r.id, 'borrower', 'borrower');
    const v = await Q.borrowerView(loanId, { role: lb.role });
    const [[loan]] = await db.query('SELECT l.loan_number, l.subject_property, u.first_nm, u.last_nm, u.email, u.phone FROM loans l LEFT JOIN mlo_users u ON u.id=l.mlo_id WHERE l.id=?', [loanId]);
    res.json({ ...v, role: lb.role, loan: { id: loanId, loanNumber: loan?.loan_number, subjectProperty: loan?.subject_property },
      borrowers: (await Q.borrowerAccounts(loanId)).map(b => ({ name: b.name, role: b.role, slot: b.slot })),
      mlo: loan ? { name: [loan.first_nm, loan.last_nm].filter(Boolean).join(' ') || 'Your loan officer', email: loan.email, phone: loan.phone } : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:loanId/quote/:id/decision', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const lb = await seat(req, loanId);
    if (!lb) return res.status(404).json({ error: 'Application not found' });
    if (lb.role !== 'primary') return res.status(403).json({ error: 'Only the primary borrower can accept or decline a quote' });
    const [[q]] = await db.query('SELECT id, loan_id, hidden_at FROM insurance_quotes WHERE id=? AND loan_id=?', [Number(req.params.id), loanId]);
    if (!q || q.hidden_at) return res.status(404).json({ error: 'Quote not found' });
    const decision = req.body?.decision === 'accepted' ? 'accepted' : req.body?.decision === 'declined' ? 'declined' : null;
    if (!decision) return res.status(422).json({ error: 'decision must be accepted or declined' });
    const result = await Q.decideQuote({ quoteId: q.id, decision, by: me(req), reason: req.body?.reason });
    notify.decision({ loanId, decisionType: decision, result, by: me(req) }).catch(() => {});
    res.json({ ok: true, ...(await Q.borrowerView(loanId, { role: lb.role })) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:loanId/request/:id/messages', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    const lb = await seat(req, loanId);
    if (!lb) return res.status(404).json({ error: 'Application not found' });
    const [[r]] = await db.query('SELECT r.*, p.name AS provider_name FROM insurance_quote_requests r JOIN insurance_providers p ON p.id=r.provider_id WHERE r.id=? AND r.loan_id=?', [Number(req.params.id), loanId]);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    const body = String(req.body?.body || '').trim().slice(0, 4000);
    if (!body) return res.status(422).json({ error: 'Message is empty' });
    await db.query('INSERT INTO quote_messages SET ?', { request_id: r.id, channel: 'borrower', sender_type: 'borrower', sender_id: req.user.id, sender_name: me(req).name, body });
    notify.borrowerMessageToMlo({ loanId, request: r, body, borrowerName: me(req).name }).catch(() => {});
    res.status(201).json(await Q.requestView(r, { side: 'borrower', withMessages: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:loanId/quote/:id/pdf', async (req, res) => {
  try {
    const loanId = Number(req.params.loanId);
    if (!(await seat(req, loanId))) return res.status(404).json({ error: 'Application not found' });
    const [[q]] = await db.query('SELECT pdf, pdf_file_name, quote_id, hidden_at FROM insurance_quotes WHERE id=? AND loan_id=?', [Number(req.params.id), loanId]);
    if (!q || !q.pdf || q.hidden_at) return res.status(404).json({ error: 'No PDF on this quote' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(q.pdf_file_name || q.quote_id + '.pdf').replace(/"/g, '')}"`);
    res.send(q.pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
