import { $app, api, h, escapeHtml, debounce } from '../app.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { addRecent, loadRecent, saveRecent, parseLink } from '../search-history.js';

// Remembers the last online search for the session, so after importing one
// version the user can come back and grab another without retyping.
const STATE_KEY = 'opentabs.searchState';
const OFFLINE = 'You are offline. Online search needs a connection.';

export async function searchView() {
  $app.innerHTML = `
    <header class="topbar">
      <h1>Search online</h1>
      <select id="source" class="btn"></select>
    </header>
    <main class="content">
      <input class="searchbox" id="q" type="search" placeholder="Song, artist, or paste a tab URL…" autocomplete="off">
      <div class="search-start" id="start" hidden>
        <p class="search-hint">Search for a song or artist, or paste a link to a tab.</p>
        <button type="button" class="btn" id="paste" hidden>${icon('clipboard')} Paste link</button>
        <div id="recent" hidden>
          <div class="search-recent-head">
            <h2 class="label">Recent</h2>
            <button type="button" class="btn quiet" id="clear-recent">Clear</button>
          </div>
          <ul class="songlist" id="recent-list"></ul>
        </div>
      </div>
      <div class="chips" id="types" hidden></div>
      <ul class="songlist" id="results"></ul>
    </main>`;

  const $source = document.getElementById('source');
  const $q = document.getElementById('q');
  const $results = document.getElementById('results');
  const $types = document.getElementById('types');
  const $start = document.getElementById('start');
  const $recent = document.getElementById('recent');
  const $recentList = document.getElementById('recent-list');
  const $paste = document.getElementById('paste');

  let sourcesList = [];
  try {
    sourcesList = await api('/sources');
  } catch (err) {
    if (err.message === 'unauthorized') return;
    if (!navigator.onLine) {
      $results.innerHTML = `<li class="empty">${OFFLINE}</li>`;
      return;
    }
  }
  if (sourcesList.length === 0) {
    $results.innerHTML = `<li class="empty">No tab sources configured.<br>
      See <code>server/sources/provider.md</code> to add one.</li>`;
    return;
  }
  $source.innerHTML = sourcesList
    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.label)}</option>`)
    .join('');

  let gen = 0;
  let lastRows = [];
  let activeType = null;
  let openKeys = new Set(); // groups the user has expanded

  // One group per song + artist, preserving the provider's relevance order.
  // Versions inside a group are sorted by votes (most trusted first), like UG.
  function groupRows(rows) {
    const groups = new Map();
    for (const r of rows) {
      const key = `${(r.artist || '').toLowerCase()}::${(r.title || '').toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, { key, rows: [] });
      groups.get(key).rows.push(r);
    }
    for (const g of groups.values()) {
      g.rows.sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1));
    }
    return [...groups.values()];
  }

  function ratingHtml(r) {
    if (!r.rating) return '';
    return `<span class="rating">${icon('star', { cls: 'fill', label: 'Rating' })} ${escapeHtml(r.rating)}</span> <span class="count">(${escapeHtml(r.votes ?? 0)})</span>`;
  }

  function renderResults() {
    const rows = activeType ? lastRows.filter((r) => r.type === activeType) : lastRows;

    const types = new Set(lastRows.map((r) => r.type).filter(Boolean));
    $types.hidden = types.size < 2;
    $types.innerHTML = '';
    for (const t of types) {
      const chip = h(`<button class="chip${t === activeType ? ' active' : ''}" type="button">${escapeHtml(t)}</button>`);
      chip.onclick = () => { activeType = activeType === t ? null : t; renderResults(); };
      $types.append(chip);
    }

    const groups = groupRows(rows);
    if (groups.length === 0) {
      $results.innerHTML = '<li class="empty">No results.</li>';
      return;
    }
    $results.innerHTML = '';
    for (const g of groups) $results.append(groupItem(g));
  }

  function groupItem(g) {
    const top = g.rows[0];
    const many = g.rows.length > 1;
    const open = openKeys.has(g.key);
    const li = h(`
      <li class="result${open ? ' open' : ''}"><a href="javascript:void 0">
        <div class="title">${escapeHtml(top.title)}
          ${many
            ? `<span class="badge">${g.rows.length} versions</span>`
            : top.type ? `<span class="badge">${escapeHtml(top.type)}</span>` : ''}
        </div>
        <div class="meta">${escapeHtml(top.artist)} ${ratingHtml(top)}</div>
      </a></li>`);
    const head = li.querySelector('a');
    if (!many) {
      // Single version: import straight away, like before.
      head.onclick = () => importTab(top, head);
      return li;
    }
    if (open) li.append(versionList(g));
    head.onclick = () => {
      if (openKeys.has(g.key)) openKeys.delete(g.key);
      else openKeys.add(g.key);
      li.replaceWith(groupItem(g));
    };
    return li;
  }

  function versionList(g) {
    const ul = h('<ul class="versions"></ul>');
    for (const r of g.rows) {
      const row = h(`
        <li><button type="button">
          <span class="ver">ver ${escapeHtml(r.version ?? 1)}</span>
          ${r.type ? `<span class="badge vtype">${escapeHtml(r.type)}</span>` : ''}
          <span class="vrating">${ratingHtml(r)}</span>
        </button></li>`);
      const btn = row.querySelector('button');
      btn.onclick = () => importTab(r, btn);
      ul.append(row);
    }
    return ul;
  }

  // A pasted tab URL skips search and imports directly through whichever
  // provider claims its hostname (providers export `hosts`).
  const asTabUrl = parseLink;

  async function search() {
    const my = ++gen;
    const q = $q.value.trim();
    $types.hidden = true;
    if (!q) { $results.innerHTML = ''; sessionStorage.removeItem(STATE_KEY); showStart(); return; }
    $start.hidden = true;

    const pasted = asTabUrl(q);
    if (pasted) {
      const p = sourcesList.find((s) => (s.hosts || []).includes(pasted.hostname));
      if (!p) {
        $results.innerHTML = `<li class="empty">No source can import URLs from
          <code>${escapeHtml(pasted.hostname)}</code>.</li>`;
        return;
      }
      const row = h('<li class="spinner"></li>');
      $results.innerHTML = '';
      $results.append(row);
      importTab({ url: pasted.href }, row, p.name);
      return;
    }

    $results.innerHTML = '<li class="spinner">Searching…</li>';
    try {
      const rows = await api(
        `/sources/${$source.value}/search?q=` + encodeURIComponent(q)
      );
      if (my !== gen) return; // a newer search superseded this response
      lastRows = rows;
      activeType = null;
      openKeys = new Set();
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ source: $source.value, q }));
      saveRecent(localStorage, addRecent(loadRecent(localStorage), q));
      renderResults();
    } catch (err) {
      if (my !== gen) return;
      $results.innerHTML = navigator.onLine
        ? `<li class="empty error">${escapeHtml(err.message)}</li>`
        : `<li class="empty">${OFFLINE}</li>`;
    }
  }

  async function importTab(r, el, sourceName = $source.value) {
    el.classList.add('busy');
    const label = h('<span class="busy-label">Importing…</span>');
    el.append(label);
    try {
      const tab = await api(
        `/sources/${sourceName}/tab?url=` + encodeURIComponent(r.url)
      );
      // Hand the imported tab to the preview view for review before saving.
      sessionStorage.setItem('opentabs.import', JSON.stringify(tab));
      location.hash = '#/preview';
    } catch (err) {
      el.classList.remove('busy');
      label.remove();
      toast('Import failed: ' + err.message, { danger: true });
    }
  }

  // Start page, shown while the box is empty: recent searches and a way to
  // import a link straight from the clipboard.
  function showStart() {
    const recent = loadRecent(localStorage);
    $recent.hidden = recent.length === 0;
    $recentList.innerHTML = '';
    for (const q of recent) {
      const li = h(`<li><a href="javascript:void 0"><div class="title">${escapeHtml(q)}</div></a></li>`);
      li.querySelector('a').onclick = () => { $q.value = q; search(); };
      $recentList.append(li);
    }
    $start.hidden = false;
  }

  document.getElementById('clear-recent').onclick = () => {
    saveRecent(localStorage, []);
    showStart();
  };

  // Reading the clipboard needs a tap (iOS asks each time), so it happens
  // here rather than on load.
  if (navigator.clipboard?.readText) {
    $paste.hidden = false;
    $paste.onclick = async () => {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast('Could not read the clipboard', { danger: true });
        return;
      }
      const link = parseLink(text);
      if (!link) { toast('No link in the clipboard'); return; }
      $q.value = link.href;
      search();
    };
  }

  // Another source answers the same query differently: run it again there.
  $source.addEventListener('change', () => {
    if ($q.value.trim()) search();
  });

  const debouncedSearch = debounce(search, 500);
  $q.addEventListener('input', debouncedSearch);
  $q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { debouncedSearch.cancel(); search(); }
  });

  // Restore the previous search of this session, if any.
  try {
    const prev = JSON.parse(sessionStorage.getItem(STATE_KEY));
    if (prev?.q && sourcesList.some((s) => s.name === prev.source)) {
      $source.value = prev.source;
      $q.value = prev.q;
      search();
    }
  } catch { /* start blank */ }
  if (!$q.value) showStart();
  $q.focus();

  return () => debouncedSearch.cancel();
}
