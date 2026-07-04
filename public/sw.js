// OpenTabs service worker: cache-first for the app shell, network-first with
// cache fallback for the songs API so the library stays readable offline.
const SHELL_CACHE = 'opentabs-shell-v1';
const API_CACHE = 'opentabs-api-v1';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/chords.js',
  '/js/views/library.js', '/js/views/reader.js', '/js/views/editor.js',
  '/js/views/search.js', '/js/views/login.js',
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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Songs API: network first, fall back to last cached copy when offline.
  if (url.pathname.startsWith('/api/songs')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // auth, sources: network only

  // Static shell: cache first.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
