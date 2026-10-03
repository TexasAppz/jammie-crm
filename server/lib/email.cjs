'use strict';
/**
 * server/lib/email.cjs — one place every email leaves from.
 *
 * MODES
 *   dry-run   EMAIL_DRY_RUN=1, or no RESEND_API_KEY set.
 *             Nothing is sent. The message (and any link in it) is printed
 *             to the PM2 log and recorded in email_log with provider='dry-run'.
 *             This is how Phase 2 is tested before an email provider exists.
 *   resend    RESEND_API_KEY set and EMAIL_DRY_RUN not '1'.
 *             POST https://api.resend.com/emails. Requires the sending domain
 *             (jammie-mlo.com) to be verified in Resend: two DNS records in
 *             Cloudflare, which Resend's dashboard lists.
 *
 * ENV
 *   APP_BASE_URL    https://jammie-mlo.com   (links in emails are built from this)
 *   EMAIL_FROM      "Jammie Mortgage <noreply@jammie-mlo.com>"
 *   RESEND_API_KEY  re_...
 *   EMAIL_DRY_RUN   1 to force dry-run even with a key
 *
 * Every send, real or dry, writes an email_log row. send() never throws on
 * provider failure — it returns { ok:false, error } and logs it, because an
 * invite that saved but did not email is recoverable (Resend button), while
 * an invite that threw halfway is not.
 */

const db = require('../db.cjs');

const BASE_URL = () => (process.env.APP_BASE_URL || 'https://jammie-mlo.com').replace(/\/+$/, '');
const FROM     = () => process.env.EMAIL_FROM || 'Jammie Mortgage <noreply@jammie-mlo.com>';
const isDryRun = () => process.env.EMAIL_DRY_RUN === '1' || !process.env.RESEND_API_KEY;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── layout ──────────────────────────────────────────────────────────────
function layout({ title, bodyHtml, footerHtml }) {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e2d45">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%">
        <tr><td style="background:#0f1623;border-radius:12px 12px 0 0;padding:20px 28px">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px">Jammie</span>
          <span style="color:#60a5fa;font-size:10px;font-weight:600;margin-left:6px;letter-spacing:.06em">MORTGAGE</span>
        </td></tr>
        <tr><td style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none">
          <h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#1e2d45">${esc(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 28px;font-size:12px;color:#6b7280;line-height:1.6">
          ${footerHtml || ''}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

const button = (href, label) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;font-size:15px">${esc(label)}</a></p>`;

// ── templates ───────────────────────────────────────────────────────────
function inviteTemplate({ borrowerFirst, mloName, mloEmail, mloPhone, inviteUrl, expiresDays }) {
  const subject = `${mloName} invited you to start your mortgage application`;
  const html = layout({
    title: `Hi ${borrowerFirst || 'there'}, let's get your application started`,
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6">${esc(mloName)} has set up your mortgage application on Jammie. It takes about 20 minutes, saves as you go, and you can come back any time.</p>
      <p style="margin:0 0 4px;font-size:15px;line-height:1.6">Click below to choose a password and begin.</p>
      ${button(inviteUrl, 'Start my application')}
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">This link is personal to you and expires in ${expiresDays} days. If it has expired, reply to this email and ${esc(mloName)} will send a new one.</p>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;word-break:break-all">If the button does not work, copy this address into your browser:<br>${esc(inviteUrl)}</p>`,
    footerHtml: `Your loan officer: <strong>${esc(mloName)}</strong>${mloPhone ? ` · ${esc(mloPhone)}` : ''}${mloEmail ? ` · <a href="mailto:${esc(mloEmail)}" style="color:#2563eb">${esc(mloEmail)}</a>` : ''}`,
  });
  const text = `${mloName} invited you to start your mortgage application on Jammie.\n\nStart here: ${inviteUrl}\n\nThis link expires in ${expiresDays} days.${mloPhone ? `\n\nQuestions? ${mloName} · ${mloPhone}` : ''}`;
  return { subject, html, text };
}

// ── transport ───────────────────────────────────────────────────────────
async function deliverResend({ to, subject, html, text, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text, reply_to: replyTo || undefined }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Resend HTTP ${res.status}`);
  return body.id || null;
}

async function logEmail(row) {
  try { await db.query('INSERT INTO email_log SET ?', row); }
  catch (e) { console.error('[email] log write failed:', e.message); }
}

/**
 * send({ to, type, loanId, subject, html, text, replyTo, link })
 * -> { ok, provider, providerId?, dryRun, link?, error? }
 */
async function send({ to, type, loanId = null, subject, html, text, replyTo, link }) {
  const base = { to_email: to, type, loan_id: loanId, subject: String(subject).slice(0, 255) };

  if (isDryRun()) {
    const rule = '─'.repeat(70);
    console.log(`\n${rule}\n[email DRY RUN] type=${type} to=${to}\nsubject: ${subject}${link ? `\nLINK: ${link}` : ''}\n${rule}\n`);
    await logEmail({ ...base, provider: 'dry-run', provider_id: null, error: null });
    return { ok: true, provider: 'dry-run', dryRun: true, link };
  }

  try {
    const id = await deliverResend({ to, subject, html, text, replyTo });
    await logEmail({ ...base, provider: 'resend', provider_id: id, error: null });
    return { ok: true, provider: 'resend', providerId: id, dryRun: false, link };
  } catch (e) {
    console.error(`[email] send failed type=${type} to=${to}:`, e.message);
    await logEmail({ ...base, provider: 'resend', provider_id: null, error: String(e.message).slice(0, 500) });
    return { ok: false, provider: 'resend', dryRun: false, error: e.message, link };
  }
}

async function sendInvite({ to, loanId, borrowerFirst, mlo, token, expiresDays = 7 }) {
  const inviteUrl = `${BASE_URL()}/apply/invite/${token}`;
  const mloName = [mlo.first_nm, mlo.last_nm].filter(Boolean).join(' ') || 'Your loan officer';
  const t = inviteTemplate({ borrowerFirst, mloName, mloEmail: mlo.email, mloPhone: mlo.phone, inviteUrl, expiresDays });
  return send({ to, type: 'invite', loanId, ...t, replyTo: mlo.email, link: inviteUrl });
}

module.exports = { send, sendInvite, isDryRun, BASE_URL };
