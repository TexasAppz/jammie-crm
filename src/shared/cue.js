// src/shared/cue.js — "something new arrived" cue for the live chat / quote lists: a short two-tone
// chime plus a "(n)" prefix on the tab title while the window is in the background.
//
// Browsers only let a page make sound after the person has interacted with it, so the audio context
// is created on the first click/keypress and the chime is skipped (title still flashes) until then.

let ctx = null;
function arm() {
  try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch { /* no audio */ }
}
if (typeof window !== 'undefined') ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, arm, { passive: true }));

export function playChime() {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  [[880, 0], [1174.66, 0.13]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.16, t + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.28);
    osc.connect(g).connect(ctx.destination); osc.start(t + at); osc.stop(t + at + 0.3);
  });
}

const baseTitle = typeof document !== 'undefined' ? document.title : '';
let pending = 0;
function restoreTitle() { if (pending && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) { pending = 0; document.title = baseTitle; } }
if (typeof window !== 'undefined') { window.addEventListener('focus', restoreTitle); document.addEventListener('visibilitychange', restoreTitle); }
export function flashTitle(n = 1) {
  if (typeof document === 'undefined') return;
  pending += n; document.title = `(${pending}) ${baseTitle}`;
}

/** Chime now; prefix the tab title too when the window is not in front. */
export function newArrivalCue({ count = 1, silent = false } = {}) {
  if (!silent) playChime();
  if (typeof document !== 'undefined' && (document.visibilityState !== 'visible' || !document.hasFocus())) flashTitle(count);
}

/**
 * Compare two id lists and say how many ids are new. Returns 0 on the first call (no previous
 * list), so an initial page load never chimes.
 */
export function countNew(prevIds, nextIds) {
  if (!prevIds) return 0;
  const seen = new Set(prevIds);
  return nextIds.filter(id => !seen.has(id)).length;
}
