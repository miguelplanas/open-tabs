import { $app, api, h, escapeHtml, debounce } from '../app.js';
import { segmentNav } from '../ui.js';

const PREFS_KEY = 'opentabs.libraryPrefs';

const SORTS = {
  recent: { label: 'Recent', cmp: null }, // server order: played_at, then updated_at
  title: { label: 'Title', cmp: (a, b) => a.title.localeCompare(b.title) },
  artist: { label: 'Artist', cmp: (a, b) => (a.artist || '').localeCompare(b.artist || '') || a.title.localeCompare(b.title) },
};

export async function libraryView() {
  // Songs opened from the plain library aren't part of a setlist.
  sessionStorage.removeItem('opentabs.setlist');
  $app.innerHTML = `
    <header class="topbar">
      <h1>OpenTabs <span class="count" id="count"></span></h1>
      <button class="btn icon" id="go-search" title="Search online">🌐</button>
      <button class="btn primary" id="go-new">+ New</button>
    </header>
    <main class="content">
      <div id="seg"></div>
      <input class="searchbox" id="q" type="search" placeholder="Search your library…" autocomplete="off">
      <div class="toolbar">
        <select class="btn" id="sort"></select>
        <button class="btn" id="group-toggle" title="Group by artist" aria-pressed="false">By artist</button>
      </div>
      <ul class="songlist" id="list"><li class="spinner">Loading…</li></ul>
    </main>`;

  document.getElementById('go-new').onclick = () => (location.hash = '#/new');
  document.getElementById('go-search').onclick = () => (location.hash = '#/search');
  document.getElementById('seg').append(segmentNav('songs'));

  const $q = document.getElementById('q');
  const $list = document.getElementById('list');
  const $sort = document.getElementById('sort');
  const $group = document.getElementById('group-toggle');

  $sort.innerHTML = Object.entries(SORTS)
    .map(([k, v]) => `<option value="${k}">Sort: ${v.label}</option>`)
    .join('');

  // Restore the sort/group choices the owner last used.
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { /* ignore */ }
  if (prefs.sort && SORTS[prefs.sort]) $sort.value = prefs.sort;
  let grouped = Boolean(prefs.grouped);
  $group.classList.toggle('active', grouped);
  $group.setAttribute('aria-pressed', String(grouped));
  let all = [];

  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: $sort.value, grouped }));
  }

  function render() {
    let songs = all;
    const cmp = SORTS[$sort.value].cmp;
    if (cmp) songs = [...songs].sort(cmp);

    if (songs.length === 0) {
      $list.innerHTML = `<li class="empty"><div class="strings"></div>${
        $q.value ? 'No songs match.' : 'Your library is empty.<br>Add a song, or search online to import one.'
      }</li>`;
      return;
    }

    $list.innerHTML = '';
    if (grouped) {
      const byArtist = new Map();
      for (const s of songs) {
        const key = s.artist || 'Unknown artist';
        if (!byArtist.has(key)) byArtist.set(key, []);
        byArtist.get(key).push(s);
      }
      for (const artist of [...byArtist.keys()].sort((a, b) => a.localeCompare(b))) {
        $list.append(h(`<li class="group-header">${escapeHtml(artist)}</li>`));
        for (const s of byArtist.get(artist)) $list.append(songItem(s, true));
      }
    } else {
      for (const s of songs) $list.append(songItem(s, false));
    }
  }

  let gen = 0;
  async function load() {
    const my = ++gen;
    try {
      all = await api('/songs?q=' + encodeURIComponent($q.value.trim()));
      if (my !== gen) return; // a newer search superseded this response
      if (!$q.value.trim()) {
        const n = all.length;
        document.getElementById('count').textContent =
          n > 0 ? `· ${n} ${n === 1 ? 'song' : 'songs'}` : '';
      }
      render();
    } catch (err) {
      if (my === gen && err.message !== 'unauthorized') {
        $list.innerHTML = `<li class="empty error">${escapeHtml(err.message)}</li>`;
      }
    }
  }

  const debouncedLoad = debounce(load, 200);
  $q.addEventListener('input', debouncedLoad);
  $sort.addEventListener('change', () => { savePrefs(); render(); });
  $group.onclick = () => {
    grouped = !grouped;
    $group.classList.toggle('active', grouped);
    $group.setAttribute('aria-pressed', String(grouped));
    savePrefs();
    render();
  };
  await load();

  return () => debouncedLoad.cancel();
}

function songItem(s, hideArtist) {
  return h(`
    <li><a href="#/song/${s.id}">
      <div class="title">${escapeHtml(s.title)}${
        s.capo ? `<span class="badge">capo ${s.capo}</span>` : ''
      }${s.source ? `<span class="badge">${escapeHtml(s.source)}</span>` : ''}</div>
      ${hideArtist ? '' : `<div class="meta">${escapeHtml(s.artist || 'Unknown artist')}</div>`}
    </a></li>`);
}
