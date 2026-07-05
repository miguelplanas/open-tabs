// OpenTabs service worker.
// App shell: stale-while-revalidate, so installed PWAs serve instantly from
// cache but pick up deployed changes on the next load without anyone having
// to remember to bump a version string.
// Songs API: network-first with cache fallback so the library stays readable
// offline. Only canonical URLs (/api/songs and /api/songs/:id) are cached to
// keep the cache bounded; per-keystroke ?q= searches are not stored.
const SHELL_CACHE = 'opentabs-shell-v8';
const API_CACHE = 'opentabs-api-v3';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/chords.js', '/js/ui.js',
  '/js/views/library.js', '/js/views/reader.js', '/js/views/editor.js',
  '/js/views/search.js', '/js/views/preview.js', '/js/views/login.js',
  '/js/views/collections.js', '/js/views/collection.js',
  '/icons/icon.svg',
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
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok && cacheableApi(url)) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
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
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
