'use strict';
/**
 * server/lib/quote-notify.cjs — the e-mails the quote flow sends, in one place.
 * Every call is fire-and-forget (errors are swallowed; EMAIL_DRY_RUN logs instead of sending).
 *
 *   newQuoteToBorrowers(...)   provider submitted/revised: tell every borrower on the loan
 *   decision(...)              borrower (or MLO on their behalf) accepted/declined:
 *                              winner "Accepted by borrower", others "Not selected", MLO summary
 *   borrowerMessageToMlo(...)  borrower asked a question on a quote        ┐ chat is live in all three portals,
 *   mloMessageToBorrowers(...) MLO answered in the borrower thread           │ so message e-mails are OFF unless
 *   mloMessageToProvider(...)  MLO wrote to the agent                        │ QUOTE_MESSAGE_EMAILS=1 is set in .env
 *   providerMessageToMlo(...)  agent wrote to the MLO                        ┘ (requests, quotes and decisions still e-mail)
 */
const db    = require('../db.cjs');
const Q     = require('./quotes.cjs');
const email = require('./email.cjs');

const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const portalUrl   = () => `${email.BASE_URL()}/insurance`;
const crmUrl      = loanId => `${email.BASE_URL()}/?loan=${loanId}&tab=quotes`;
const borrowerUrl = loanId => `${email.BASE_URL()}/apply/loan/${loanId}/quotes`;
const quiet = p => p && p.catch ? p.catch(() => {}) : p;
const MESSAGE_EMAILS = () => process.env.QUOTE_MESSAGE_EMAILS === '1';

async function providerOf(id) { const [[p]] = await db.query('SELECT id, name, notification_email FROM insurance_providers WHERE id=?', [id]); return p || null; }
async function mloOf(loanId) {
  const [[m]] = await db.query('SELECT u.email, u.first_nm, u.last_nm FROM loans l JOIN mlo_users u ON u.id=l.mlo_id WHERE l.id=?', [loanId]).catch(() => [[null]]);
  return m ? { email: m.email, name: [m.first_nm, m.last_nm].filter(Boolean).join(' ') || m.email } : null;
}

async function newQuoteToBorrowers({ loanId, quote, providerName, revised }) {
  const people = await Q.borrowerAccounts(loanId);
  for (const b of people) {
    quiet(email.sendNotice({ to: b.email, type: revised ? 'quote_revised_borrower' : 'quote_new_borrower', loanId,
      subject: `${revised ? 'Updated' : 'New'} homeowners insurance quote for your application`,
      title: `${providerName} sent ${revised ? 'an updated' : 'a'} quote`,
      lines: [`Hi ${b.name.split(' ')[0]},`,
              `${providerName} quoted $${money(quote.monthly_premium)} / month ($${money(quote.annual_premium)} / year) for homeowners insurance on your new home.`,
              b.role === 'primary' ? 'Open your application to compare quotes and accept the one you want. Nothing is final until you accept.'
                                   : 'You can see every quote in your application; the primary borrower makes the final choice.'],
      buttonLabel: 'See the quotes', buttonUrl: borrowerUrl(loanId) }));
  }
  await db.query('UPDATE insurance_quotes SET borrower_notified_at=NOW() WHERE id=?', [quote.id]).catch(() => {});
}

async function decision({ loanId, decisionType, result, by }) {
  const q = result.quote, r = result.request;
  const onBehalf = by.type === 'mlo';
  const byText = onBehalf ? `${by.name || 'The loan officer'} recorded the borrower's decision` : 'The borrower';
  const prov = await providerOf(q.provider_id);
  if (prov?.notification_email) {
    if (decisionType === 'accepted') {
      quiet(email.sendNotice({ to: prov.notification_email, type: 'quote_accepted', loanId, subject: `Quote ${q.quote_id} accepted - request ${r.request_no}`,
        title: `Quote ${q.quote_id} was accepted by the borrower`,
        lines: [`Your quote of $${money(q.monthly_premium)} / month on request ${r.request_no} was accepted.`,
                'The loan officer will coordinate the policy start date with you through the quote portal — please do not contact the borrower directly.'],
        buttonLabel: 'Open the quote portal', buttonUrl: portalUrl() }));
    } else {
      quiet(email.sendNotice({ to: prov.notification_email, type: 'quote_not_selected', loanId, subject: `Quote ${q.quote_id} not selected - request ${r.request_no}`,
        title: `Quote ${q.quote_id} was not selected`,
        lines: [`The borrower did not go with your quote on request ${r.request_no}. Thank you for quoting.`],
        buttonLabel: 'Open the quote portal', buttonUrl: portalUrl() }));
    }
  }
  for (const ns of result.notSelected || []) {
    const p = await providerOf(ns.quote.provider_id);
    if (!p?.notification_email) continue;
    quiet(email.sendNotice({ to: p.notification_email, type: 'quote_not_selected', loanId, subject: `Quote ${ns.quote.quote_id} not selected - request ${ns.request.request_no}`,
      title: `Quote ${ns.quote.quote_id} was not selected`,
      lines: [`The borrower chose a different quote for request ${ns.request.request_no}. Thank you for quoting.`],
      buttonLabel: 'Open the quote portal', buttonUrl: portalUrl() }));
  }
  if (!onBehalf) {
    const mlo = await mloOf(loanId);
    if (mlo?.email) {
      quiet(email.sendNotice({ to: mlo.email, type: `borrower_${decisionType}`, loanId,
        subject: `Borrower ${decisionType} quote ${q.quote_id}${decisionType === 'accepted' ? ` - HOI now $${money(q.monthly_premium)}/mo` : ''}`,
        title: `${by.name || 'The borrower'} ${decisionType} ${q.quote_id}`,
        lines: decisionType === 'accepted'
          ? [`Homeowners insurance on the loan is now $${money(q.monthly_premium)} / month from ${prov?.name || 'the provider'} and is locked.`,
             ...(result.notSelected?.length ? [`${result.notSelected.length} other quote(s) were marked not selected.`] : [])]
          : [`Quote ${q.quote_id} from ${prov?.name || 'the provider'} was declined.`, ...(q.decline_reason ? [`Reason given: ${q.decline_reason}`] : [])],
        buttonLabel: 'Open the loan', buttonUrl: crmUrl(loanId) }));
    }
  }
}

async function borrowerMessageToMlo({ loanId, request, body, borrowerName }) {
  if (!MESSAGE_EMAILS()) return;
  const mlo = await mloOf(loanId);
  if (!mlo?.email) return;
  quiet(email.sendNotice({ to: mlo.email, type: 'borrower_quote_message', loanId, subject: `${borrowerName} asked about quote request ${request.request_no}`,
    title: `Question from ${borrowerName}`, lines: [`${borrowerName} wrote about the ${request.provider_name || ''} quote:`, body],
    buttonLabel: 'Reply in the loan\'s Quotes tab', buttonUrl: crmUrl(loanId) }));
}

async function mloMessageToBorrowers({ loanId, request, body, mloName }) {
  if (!MESSAGE_EMAILS()) return;
  const people = await Q.borrowerAccounts(loanId);
  for (const b of people) {
    quiet(email.sendNotice({ to: b.email, type: 'mlo_quote_message', loanId, subject: `${mloName} replied about your insurance quote`,
      title: `Message from ${mloName}`, lines: [body], buttonLabel: 'Open your quotes', buttonUrl: borrowerUrl(loanId) }));
  }
}

async function mloMessageToProvider({ loanId, request, body, mlo }) {
  if (!MESSAGE_EMAILS()) return;
  const p = await providerOf(request.provider_id);
  if (!p?.notification_email) return;
  quiet(email.sendNotice({ to: p.notification_email, type: 'quote_message', loanId, subject: `Message on ${request.request_no} from ${mlo?.name || 'the loan officer'}`,
    title: `New message on ${request.request_no}`, lines: [`${mlo?.name || 'The loan officer'} wrote:`, body], buttonLabel: 'Reply in the quote portal', buttonUrl: portalUrl(), replyTo: mlo?.email }));
}

async function providerMessageToMlo({ loanId, request, body, agentName, providerName, mloEmail, replyTo }) {
  if (!MESSAGE_EMAILS()) return;
  if (!mloEmail) return;
  quiet(email.sendNotice({ to: mloEmail, type: 'quote_message', loanId, subject: `Message on ${request.request_no} from ${providerName}`,
    title: `New message on ${request.request_no}`, lines: [`${agentName} (${providerName}) wrote:`, body], buttonLabel: 'Reply in the loan\'s Quotes tab', buttonUrl: crmUrl(loanId), replyTo }));
}

module.exports = { newQuoteToBorrowers, decision, borrowerMessageToMlo, mloMessageToBorrowers, mloMessageToProvider, providerMessageToMlo, borrowerUrl, crmUrl, portalUrl, MESSAGE_EMAILS };
