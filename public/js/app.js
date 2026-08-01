import { libraryView } from './views/library.js';
import { readerView } from './views/reader.js';
import { editorView } from './views/editor.js';
import { searchView } from './views/search.js';
import { previewView } from './views/preview.js';
import { collectionsView } from './views/collections.js';
import { collectionView } from './views/collection.js';
import { loginView } from './views/login.js';

export const $app = document.getElementById('app');

export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    location.hash = '#/login';
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export { escapeHtml } from './chords.js';

// Debounced wrapper with .cancel() so views can clear pending timers in
// their teardown.
export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

const routes = [
  { re: /^#?\/?$/, view: libraryView },
  { re: /^#\/song\/(\d+)$/, view: readerView },
  { re: /^#\/edit\/(\d+)$/, view: editorView },
  { re: /^#\/new$/, view: editorView },
  { re: /^#\/search$/, view: searchView },
  { re: /^#\/preview$/, view: previewView },
  { re: /^#\/collections$/, view: collectionsView },
  { re: /^#\/collection\/(\d+)$/, view: collectionView },
  { re: /^#\/login$/, view: loginView },
];

let teardown = null;
let navSeq = 0;

// List views remember where you left them: opening a song from halfway down
// the library and coming back should not dump you at the top of the list
// again. Keyed by hash, so every collection keeps its own place. The reader is
// deliberately not in this set: a song always opens on its first line.
const KEEPS_SCROLL = /^#?\/?$|^#\/collections$|^#\/collection\/\d+$|^#\/search$/;
const scrollMemo = new Map();
let lastHash = null;

// Replacing #app's innerHTML collapses the document height, so the browser's
// own restoration has nothing to aim at; we do it ourselves after the view
// has painted.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function restoreScroll(hash, seq) {
  const y = KEEPS_SCROLL.test(hash) ? scrollMemo.get(hash) || 0 : 0;
  window.scrollTo(0, y);
  // A view can still be growing on the frame it returns (late list rows, the
  // reader's font fitting), so aim once more once layout settles.
  if (y) requestAnimationFrame(() => { if (seq === navSeq) window.scrollTo(0, y); });
}

async function route() {
  const my = ++navSeq;
  if (lastHash && KEEPS_SCROLL.test(lastHash)) scrollMemo.set(lastHash, window.scrollY);
  if (typeof teardown === 'function') teardown();
  teardown = null;
  const hash = location.hash || '#/';
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) {
      const td = await r.view(m.slice(1));
      if (my !== navSeq) {
        // A newer navigation won while this view was loading: discard it and
        // repaint the current route in case this one drew over it.
        if (typeof td === 'function') td();
        route();
        return;
      }
      teardown = td;
      lastHash = hash;
      restoreScroll(hash, my);
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Offline cache warmer: the service worker only caches songs and collections
// as they are fetched, so a song imported but never opened would be missing
// offline. Fetch everything once per app load (deferred, best-effort) so the
// whole library is readable with no signal.
export function warmSong(id) {
  fetch(`/api/songs/${id}`).catch(() => {});
}

let warmed = false;
async function warmOfflineCache() {
  if (warmed || !navigator.onLine || !('serviceWorker' in navigator)) return;
  warmed = true;
  try {
    const [songRes, colRes] = await Promise.all([
      fetch('/api/songs'),
      fetch('/api/collections'),
    ]);
    if (!songRes.ok || !colRes.ok) throw new Error('warm skipped');
    const urls = [
      ...(await songRes.json()).map((s) => `/api/songs/${s.id}`),
      ...(await colRes.json()).map((c) => `/api/collections/${c.id}`),
    ];
    let i = 0;
    const worker = async () => {
      while (i < urls.length) await fetch(urls[i++]).catch(() => {});
    };
    await Promise.all([worker(), worker(), worker()]);
  } catch {
    warmed = false; // retry on the next load
  }
}
const whenIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
whenIdle(() => warmOfflineCache());
