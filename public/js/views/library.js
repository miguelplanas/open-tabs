import { $app, api, h, escapeHtml, debounce } from '../app.js';
import { segmentNav, groupVersions, versionPickerDialog } from '../ui.js';

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
    // One row per song, not per row in the database: the versions of a song
    // (a chord sheet and a tab of it, two transcriptions) collapse into one
    // entry. Sorting and artist grouping act on each group's representative,
    // which is the version the server put first, so the most recently played
    // or edited one speaks for the group.
    let groups = groupVersions(all);
    const cmp = SORTS[$sort.value].cmp;
    if (cmp) groups = [...groups].sort((a, b) => cmp(a[0], b[0]));

    if (groups.length === 0) {
      $list.innerHTML = `<li class="empty"><div class="strings"></div>${
        $q.value ? 'No songs match.' : 'Your library is empty.<br>Add a song, or search online to import one.'
      }</li>`;
      return;
    }

    $list.innerHTML = '';
    if (grouped) {
      const byArtist = new Map();
      for (const g of groups) {
        const key = g[0].artist || 'Unknown artist';
        if (!byArtist.has(key)) byArtist.set(key, []);
        byArtist.get(key).push(g);
      }
      for (const artist of [...byArtist.keys()].sort((a, b) => a.localeCompare(b))) {
        $list.append(h(`<li class="group-header">${escapeHtml(artist)}</li>`));
        for (const g of byArtist.get(artist)) $list.append(songItem(g, true));
      }
    } else {
      for (const g of groups) $list.append(songItem(g, false));
    }
  }

  let gen = 0;
  async function load() {
    const my = ++gen;
    try {
      // No query: hit the canonical /songs URL, which the service worker
      // caches for offline. ?q= URLs are deliberately never cached.
      const q = $q.value.trim();
      all = await api(q ? '/songs?q=' + encodeURIComponent(q) : '/songs');
      if (my !== gen) return; // a newer search superseded this response
      if (!$q.value.trim()) {
        // Songs, not rows: a song with three versions counts once.
        const n = groupVersions(all).length;
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

// `versions` is a group: one song, one or more rows. A single version behaves
// exactly as before (a plain link); several open the picker instead, so the
// choice of version happens before the reader, not inside it.
function songItem(versions, hideArtist) {
  const s = versions[0];
  const many = versions.length > 1;
  const li = h(`
    <li><a href="${many ? 'javascript:void 0' : '#/song/' + s.id}">
      <div class="title">${escapeHtml(s.title)}${
        many
          ? `<span class="badge">${versions.length} versions</span>`
          : s.capo ? `<span class="badge">capo ${s.capo}</span>` : ''
      }</div>
      ${hideArtist ? '' : `<div class="meta">${escapeHtml(s.artist || 'Unknown artist')}</div>`}
    </a></li>`);
  if (many) li.querySelector('a').onclick = () => versionPickerDialog(versions);
  return li;
}
