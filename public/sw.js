// OpenTabs service worker.
// App shell: stale-while-revalidate, so installed PWAs serve instantly from
// cache but pick up deployed changes on the next load without anyone having
// to remember to bump a version string. The cache name below carries a hash
// of public/ purely so a deploy that changed something purges the old entries
// at once instead of after one stale load.
// Songs API: network-first with cache fallback so the library stays readable
// offline. Only canonical URLs (/api/songs and /api/songs/:id) are cached to
// keep the cache bounded; per-keystroke ?q= searches are not stored.
// __SHELL_VERSION__ is substituted by the server with a hash of everything
// under public/ (see server/index.js). Do not hand-edit it and do not turn it
// back into a counter: a number that every branch bumps to the same value is
// a merge conflict on every second PR, and one that a rebase silently drops.
// Served raw the placeholder is still a valid cache name, so opening this file
// directly or serving public/ from anything else degrades to one fixed cache.
const SHELL_CACHE = 'opentabs-shell-__SHELL_VERSION__';
const API_CACHE = 'opentabs-api-v3';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/chords.js', '/js/ui.js', '/js/chord-shapes.js',
  '/js/views/library.js', '/js/views/reader.js', '/js/views/editor.js',
  '/js/views/search.js', '/js/views/preview.js', '/js/views/login.js',
  '/js/views/collections.js', '/js/views/collection.js',
  '/icons/icon.svg?v=2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

const cacheableApi = (url) =>
  (url.pathname === '/api/songs' && !url.search) ||
  /^\/api\/songs\/\d+$/.test(url.pathname) ||
  (url.pathname === '/api/collections' && !url.search) ||
  /^\/api\/collections\/\d+$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // auth, sources: network only. Songs and collections use network-first
    // with cache fallback so the library stays readable offline.
    if (!url.pathname.startsWith('/api/songs') && !url.pathname.startsWith('/api/collections')) return;
    e.respondWith((async () => {
      // An unreachable server (VPN down, flaky signal) hangs fetch for tens
      // of seconds rather than failing, so when a cached copy exists the
      // network only gets a short head start before the cache wins.
      const cached = await caches.match(e.request);
      const network = fetch(e.request).then((res) => {
        if (res.ok && cacheableApi(url)) {
          const copy = res.clone();
          caches.open(API_CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
      try {
        if (!cached) return await network;
        return await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500)),
        ]);
      } catch {
        network.catch(() => {}); // may still settle after losing the race
        // respondWith(undefined) is a hard SW error ("response is null" on
        // iOS), so cache misses become an explicit 503 the app can show.
        return cached || new Response(JSON.stringify({ error: 'Offline and not cached' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    })());
    return;
  }

  // Static shell: serve from cache, refresh the cache in the background.
  e.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || refresh;
    })
  );
});
