'use strict';
/**
 * server/routes/rates.cjs
 *
 * Serves the Freddie Mac Primary Mortgage Market Survey (PMMS) national
 * average mortgage rates, sourced from the St. Louis Fed's FRED API.
 *
 *   MORTGAGE30US - 30-Year Fixed Rate Mortgage Average in the United States
 *   MORTGAGE15US - 15-Year Fixed Rate Mortgage Average in the United States
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A DIRECT BROWSER CALL
 *   1. The FRED API key must never reach the browser. Anything prefixed
 *      VITE_ is inlined into the public JS bundle at build time, so the
 *      key lives in plain FRED_API_KEY and is read only here.
 *   2. FRED does not send CORS headers for browser origins.
 *   3. Caching centrally means one upstream call per TTL for all users
 *      rather than one per page load.
 *
 * CACHING
 *   PMMS publishes weekly, Thursday mornings (Wednesday when a U.S.
 *   holiday falls on Thursday). Polling more than a few times a day is
 *   pointless, so results are cached in memory for CACHE_TTL_MS.
 *   On upstream failure we deliberately serve the last good value rather
 *   than an error - a rate that is a few hours stale is far more useful
 *   on a dashboard than an empty panel, and `stale: true` lets the UI
 *   say so honestly.
 *
 * ATTRIBUTION
 *   FRED marks these series "Copyrighted: Citation Required". The
 *   frontend renders the citation returned in `attribution` - do not
 *   remove it.
 */

const express = require('express');
const router  = express.Router();

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const SERIES = {
  fixed30: { id: 'MORTGAGE30US', label: '30-Yr Fixed' },
  fixed15: { id: 'MORTGAGE15US', label: '15-Yr Fixed' },
};

// 6 hours. Weekly data, but short enough to pick up Thursday's release
// the same morning without a restart.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = { data: null, fetchedAt: 0 };

/**
 * Pull the two most recent observations for a series, newest first, so we
 * can report both the current rate and the week-over-week change.
 * FRED uses "." to mean "no observation" - those rows are discarded.
 */
async function fetchSeries(seriesId, apiKey) {
  const url = `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}`
            + `&api_key=${encodeURIComponent(apiKey)}`
            + '&file_type=json&sort_order=desc&limit=5';

  // Node 18+ has global fetch. AbortSignal.timeout keeps a slow upstream
  // from holding the dashboard request open.
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`FRED returned ${res.status} for ${seriesId}`);
  }
  const json = await res.json();
  const observations = (json.observations || [])
    .filter(o => o && o.value && o.value !== '.')
    .map(o => ({ date: o.date, value: Number(o.value) }))
    .filter(o => Number.isFinite(o.value));

  if (!observations.length) {
    throw new Error(`No usable observations for ${seriesId}`);
  }

  const [latest, previous] = observations;
  return {
    rate: latest.value,
    date: latest.date,
    // null (not 0) when there is no prior week to compare against, so the
    // UI can distinguish "unchanged" from "unknown".
    change: previous ? Number((latest.value - previous.value).toFixed(3)) : null,
    previousRate: previous ? previous.value : null,
    previousDate: previous ? previous.date : null,
  };
}

async function loadRates(apiKey) {
  const [fixed30, fixed15] = await Promise.all([
    fetchSeries(SERIES.fixed30.id, apiKey),
    fetchSeries(SERIES.fixed15.id, apiKey),
  ]);
  return {
    fixed30: { ...fixed30, label: SERIES.fixed30.label, seriesId: SERIES.fixed30.id },
    fixed15: { ...fixed15, label: SERIES.fixed15.label, seriesId: SERIES.fixed15.id },
    attribution: 'Freddie Mac Primary Mortgage Market Survey, retrieved from FRED, Federal Reserve Bank of St. Louis',
    sourceUrl: 'https://fred.stlouisfed.org/series/MORTGAGE30US',
  };
}

// GET /api/rates  ->  current PMMS 30yr + 15yr averages
router.get('/', async (req, res) => {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // Explicit, actionable error rather than a generic 500 - this is the
    // most likely misconfiguration on a fresh environment.
    return res.status(503).json({
      error: 'FRED_API_KEY is not configured on the server',
      hint: 'Request a free key at https://fredaccount.stlouisfed.org/apikeys and set FRED_API_KEY in .env',
    });
  }

  const fresh = cache.data && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS;
  if (fresh) {
    return res.json({ ...cache.data, cached: true, stale: false });
  }

  try {
    const data = await loadRates(apiKey);
    cache = { data, fetchedAt: Date.now() };
    res.json({ ...data, cached: false, stale: false });
  } catch (err) {
    console.error('[rates] FRED fetch failed:', err.message);
    if (cache.data) {
      // Serve the last good value rather than nothing. `stale` tells the
      // UI to label it instead of presenting it as current.
      return res.json({
        ...cache.data,
        cached: true,
        stale: true,
        staleSince: new Date(cache.fetchedAt).toISOString(),
      });
    }
    res.status(502).json({ error: `Could not retrieve rates: ${err.message}` });
  }
});

module.exports = router;
