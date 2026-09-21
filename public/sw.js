/* Jammie CRM service worker.
 *
 * WHAT THIS DOES
 *   - Caches the app shell (index.html) and hashed static assets so the
 *     app opens instantly and survives a flaky connection.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *   - Cache ANY /api/ response. Those carry borrower PII (SSNs, income,
 *     credit data). Nothing under /api/ is ever written to the cache, and
 *     API calls fail honestly when offline instead of returning stale
 *     borrower data.
 *
 * DEPLOY SAFETY
 *   - index.html is NETWORK-FIRST so every `npm run build` is picked up on
 *     the next open; the cached copy is only used when the network fails.
 *   - Hashed assets (/assets/index-XXXX.js) are CACHE-FIRST because the
 *     hash changes on every build, making each file immutable.
 *   - Old caches are deleted on activate, so stale builds don't accumulate.
 *
 * NOTE: browsers only register service workers in a secure context
 * (HTTPS). On plain http:// the registration in App.jsx is skipped and
 * this file is never fetched — "Add to Home Screen" still works via the
 * Apple meta tags in index.html.
 */
const VERSION = 'jammie-sw-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. API: never cached, never served from cache.
  if (url.pathname.startsWith('/api/')) return;

  // 2. Hashed build assets: immutable, cache-first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }

  // 3. App shell / navigations: network-first so new builds win; cached
  //    shell only when offline.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
  }
});
