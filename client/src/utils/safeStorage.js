/**
 * Safe localStorage wrappers — never throw.
 *
 * localStorage access can fail in:
 *   - private/incognito mode (Safari < 11, some Firefox configs)
 *   - sandboxed iframes
 *   - browsers with strict 3rd-party-storage settings (Brave, Tor, etc.)
 *   - WebViews that disable DOM storage
 *
 * If we don't wrap these calls, a single failed getItem can crash the
 * entire app on mount.
 */

let cache = null;        // in-memory fallback when localStorage is unavailable
let warned = false;

function isStorageAvailable() {
  try {
    const probe = '__mg_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn('[mg] localStorage unavailable — using in-memory fallback');
    }
    return false;
  }
}

function ensureCache() {
  if (cache === null) cache = {};
  return cache;
}

export function getItem(key) {
  if (isStorageAvailable()) {
    try { return window.localStorage.getItem(key); } catch { /* fall through */ }
  }
  return ensureCache()[key] ?? null;
}

export function setItem(key, value) {
  if (isStorageAvailable()) {
    try { window.localStorage.setItem(key, value); return; } catch { /* fall through */ }
  }
  ensureCache()[key] = String(value);
}

export function removeItem(key) {
  if (isStorageAvailable()) {
    try { window.localStorage.removeItem(key); return; } catch { /* fall through */ }
  }
  delete ensureCache()[key];
}

/** Read+parse JSON; never throws. Returns fallback on any failure. */
export function getJSON(key, fallback = null) {
  const raw = getItem(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function setJSON(key, value) {
  try { setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
