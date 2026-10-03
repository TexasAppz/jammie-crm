#!/usr/bin/env node
'use strict';
/**
 * server/scripts/set-password.cjs — set an MLO's password from the VM shell.
 *
 *   cd ~/jammie-crm && node server/scripts/set-password.cjs jaimiho
 *   cd ~/jammie-crm && node server/scripts/set-password.cjs jaimiho@gmail.com
 *
 * Prompts for the new password twice (input hidden), hashes it with the
 * same bcrypt settings the app uses, and signs out every session for that
 * user. This is the lockout recovery path — no email needed.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const readline = require('readline');
const db   = require('../db.cjs');
const auth = require('../lib/auth.cjs');

// Interactive: readline with hidden input. Piped (no TTY, e.g. a script or
// CI): stdin is read whole up front, because it hits EOF while the first
// database query is still running and readline would already be closed.
const tty = !!process.stdin.isTTY;
let rl = null, piped = null, muted = false;
function readAllStdin() {
  return new Promise(resolve => {
    let d = ''; process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { d += c; });
    process.stdin.on('end', () => resolve(d));
  });
}
async function ask(question, { hidden = false } = {}) {
  if (!tty) {
    if (piped === null) piped = (await readAllStdin()).split(/\r?\n/);
    const answer = piped.shift();
    if (answer === undefined) throw new Error(`No input for: ${question.trim()}`);
    return answer;
  }
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = str => { if (!muted) write(str); };
  }
  return new Promise(resolve => {
    process.stdout.write(question);
    muted = hidden;
    rl.question('', answer => { muted = false; if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const who = String(process.argv[2] || '').trim().toLowerCase();
  if (!who) { console.error('Usage: node server/scripts/set-password.cjs <username or email>'); process.exit(1); }

  const [rows] = await db.query('SELECT id, email, username, first_nm, last_nm FROM mlo_users WHERE LOWER(email)=? OR LOWER(username)=? LIMIT 1', [who, who]);
  const u = rows[0];
  if (!u) { console.error(`No MLO account matches "${who}"`); process.exit(1); }
  console.log(`Account: ${u.first_nm || ''} ${u.last_nm || ''} <${u.email}> (username: ${u.username || '—'})`);

  const p1 = await ask('New password: ', { hidden: true });
  const problem = auth.validateNewPassword(p1);
  if (problem) { console.error(problem); process.exit(1); }
  const p2 = await ask('Confirm:      ', { hidden: true });
  if (p1 !== p2) { console.error('Passwords do not match'); process.exit(1); }

  const hash = await auth.hashPassword(p1);
  await db.query('UPDATE mlo_users SET password_hash=?, is_active=1 WHERE id=?', [hash, u.id]);
  await db.query('DELETE FROM sessions WHERE user_type=? AND user_id=?', ['mlo', u.id]);
  console.log('Password updated; all sessions for this account signed out.');
  if (rl) rl.close();
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
