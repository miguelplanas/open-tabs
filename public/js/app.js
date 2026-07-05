import { libraryView } from './views/library.js';
import { readerView } from './views/reader.js';
import { editorView } from './views/editor.js';
import { searchView } from './views/search.js';
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
  { re: /^#\/collections$/, view: collectionsView },
  { re: /^#\/collection\/(\d+)$/, view: collectionView },
  { re: /^#\/login$/, view: loginView },
];

let teardown = null;
let navSeq = 0;

async function route() {
  const my = ++navSeq;
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
