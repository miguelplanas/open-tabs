// Small JSON slots in Web Storage for what a view should still show when you
// come back to it (the library's filter, the last online search). Kept free of
// the DOM so it can be tested with node:test. Storage can throw (private mode,
// quota), and a bad value must never break a view, so both sides swallow it.

export const LIBRARY_QUERY_KEY = 'opentabs.libraryQuery';

export function loadJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

// null, undefined or '' clears the slot instead of storing an empty value.
export function saveJson(storage, key, value) {
  try {
    if (value == null || value === '') storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or full: forget it */ }
}
