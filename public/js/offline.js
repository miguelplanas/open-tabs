// Offline cache warmer bookkeeping, kept free of the DOM so it can be tested
// with node:test. The warmer in app.js used to fetch every song and collection
// on every app start (600+ requests, megabytes, as many Cache Storage writes);
// planWarm() decides which of them actually need fetching.
//
// items     what the server has now: [{ url, version }], where version is the
//           updated_at from the /api/songs and /api/collections lists.
// cached    URLs (pathnames) currently in the service worker's API cache.
// manifest  { url: version } recorded the last time each URL was warmed.
//
// A URL is fetched when it is missing from the cache (never fetched, or the
// browser evicted it) or when its version differs from the manifest (edited
// since, or warmed before the manifest existed). Cached detail URLs that the
// server no longer lists are deleted songs or collections: drop them.
export const DETAIL_URL = /^\/api\/(songs|collections)\/\d+$/;

export function planWarm({ items, cached, manifest }) {
  const live = new Set(items.map((i) => i.url));
  const fetch = items
    .filter((i) => !cached.has(i.url) || manifest[i.url] !== i.version)
    .map((i) => i.url);
  const drop = [...cached].filter((url) => DETAIL_URL.test(url) && !live.has(url));
  return { fetch, drop };
}

// The manifest to store after warming: the current version of every listed
// URL that is cached and up to date, or was just fetched successfully.
// Anything else is left out, so it is retried on the next start.
export function nextManifest({ items, cached, manifest, fetched }) {
  const out = {};
  for (const { url, version } of items) {
    if (fetched.has(url) || (cached.has(url) && manifest[url] === version)) out[url] = version;
  }
  return out;
}
