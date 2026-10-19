// Helpers for the online search's start page (recent searches, pasted
// links), kept free of the DOM so they can be tested with node:test.

export const RECENT_KEY = 'opentabs.recentSearches';
export const RECENT_MAX = 8;

// Put q first, drop older copies of it (ignoring case and spacing) and keep
// the newest `max`.
export function addRecent(list, q, max = RECENT_MAX) {
  const query = String(q ?? '').trim().replace(/\s+/g, ' ');
  const prev = Array.isArray(list) ? list : [];
  if (!query) return prev.slice(0, max);
  const key = query.toLowerCase();
  return [query, ...prev.filter((x) => x.toLowerCase().replace(/\s+/g, ' ') !== key)].slice(0, max);
}

// Storage can be missing or throw (private mode, blocked site data), and
// what is in it may be junk: both read as an empty list.
export function loadRecent(storage) {
  try {
    const list = JSON.parse(storage.getItem(RECENT_KEY));
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecent(storage, list) {
  try {
    if (list.length) storage.setItem(RECENT_KEY, JSON.stringify(list));
    else storage.removeItem(RECENT_KEY);
  } catch { /* nowhere to remember them: fine */ }
}

// A pasted http(s) link, or null for anything else.
export function parseLink(text) {
  const s = String(text ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try { return new URL(s); } catch { return null; }
}
