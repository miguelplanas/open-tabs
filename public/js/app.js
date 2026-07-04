import { libraryView } from './views/library.js';
import { readerView } from './views/reader.js';
import { editorView } from './views/editor.js';
import { searchView } from './views/search.js';
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

export const escapeHtml = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const routes = [
  { re: /^#?\/?$/, view: libraryView },
  { re: /^#\/song\/(\d+)$/, view: readerView },
  { re: /^#\/edit\/(\d+)$/, view: editorView },
  { re: /^#\/new$/, view: (params) => editorView(params) },
  { re: /^#\/search$/, view: searchView },
  { re: /^#\/login$/, view: loginView },
];

let teardown = null;

async function route() {
  if (typeof teardown === 'function') teardown();
  teardown = null;
  const hash = location.hash || '#/';
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) {
      teardown = await r.view(m.slice(1));
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
