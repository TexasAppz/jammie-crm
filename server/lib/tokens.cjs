'use strict';
/**
 * server/lib/tokens.cjs — seal/open short-lived secrets (invite tokens) so
 * they can be shown again later without sitting in the database in clear.
 *
 *   TOKEN_SECRET  any long random string in .env (openssl rand -hex 32).
 *                 If it is missing the server still works, but tokens are
 *                 stored with a "plain:" prefix and a warning is logged once.
 *
 * Format: "v1:<iv>:<ciphertext>:<tag>" (base64url). AES-256-GCM, key =
 * SHA-256(TOKEN_SECRET). Rotating TOKEN_SECRET makes old links unreadable
 * here (they still work for the borrower — the hash is what is verified);
 * the MLO just resends.
 */
const crypto = require('crypto');
let warned = false;

function key() {
  const s = process.env.TOKEN_SECRET;
  if (!s || s.length < 16) {
    if (!warned) { warned = true; console.warn('[tokens] TOKEN_SECRET is not set in .env — invitation links are stored unencrypted. Add: TOKEN_SECRET=<openssl rand -hex 32>'); }
    return null;
  }
  return crypto.createHash('sha256').update(s).digest();
}

function seal(raw) {
  const k = key();
  if (!k) return 'plain:' + raw;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(raw), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), ct.toString('base64url'), c.getAuthTag().toString('base64url')].join(':');
}

function open(enc) {
  if (!enc) return null;
  if (enc.startsWith('plain:')) return enc.slice(6);
  const k = key();
  if (!k) return null;
  try {
    const [v, iv, ct, tag] = enc.split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

module.exports = { seal, open };
