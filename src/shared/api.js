// src/shared/api.js — the one HTTP client both apps use.
//
// Imported by src/App.jsx (MLO CRM) and src/borrower/BorrowerApp.jsx.
// Relative URLs: in production nginx proxies /api → Express :3001; in local
// dev the Vite proxy does the same. Cookies carry the session, so there is
// nothing to attach here.

export const API_URL = '';

let _apiAvailable = null; // null=unknown, true=available, false=unavailable
let _apiCheckedAt = 0;

export async function checkApi() {
  const now = Date.now();
  // Trust a successful check indefinitely
  if (_apiAvailable === true) return true;
  // Only trust a FAILED check for 3 seconds — then retry.
  // This prevents one transient failure (e.g. API restarting) from
  // permanently locking the whole session into mock/offline mode.
  if (_apiAvailable === false && (now - _apiCheckedAt) < 3000) return false;
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    _apiAvailable = res.ok;
  } catch {
    _apiAvailable = false;
  }
  _apiCheckedAt = now;
  return _apiAvailable;
}

/**
 * apiFetch(path, { method, body, headers })
 * Throws Error(message) on any non-2xx; the Error also carries .status and
 * .data (the parsed JSON body) so callers can branch on e.g. 409 payloads.
 * A 401 from any non-auth route broadcasts 'jammie:unauthorized' so the
 * app can return to its sign-in screen.
 */
export async function apiFetch(path, options = {}) {
  const available = await checkApi();
  if (!available) throw new Error('API unavailable');
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('jammie:unauthorized'));
    }
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return res.json();
}
