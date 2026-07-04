import { $app, api, h, escapeHtml, debounce } from '../app.js';

export async function searchView() {
  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back">←</button>
      <h1>Search online</h1>
      <select id="source" class="btn"></select>
    </header>
    <main class="content">
      <input class="searchbox" id="q" type="search" placeholder="Song or artist…" autocomplete="off">
      <ul class="songlist" id="results"></ul>
    </main>`;

  document.getElementById('back').onclick = () => (location.hash = '#/');
  const $source = document.getElementById('source');
  const $q = document.getElementById('q');
  const $results = document.getElementById('results');

  let sourcesList = [];
  try {
    sourcesList = await api('/sources');
  } catch (err) {
    if (err.message === 'unauthorized') return;
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
  async function search() {
    const my = ++gen;
    const q = $q.value.trim();
    if (!q) { $results.innerHTML = ''; return; }
    $results.innerHTML = '<li class="spinner">Searching…</li>';
    try {
      const rows = await api(
        `/sources/${$source.value}/search?q=` + encodeURIComponent(q)
      );
      if (my !== gen) return; // a newer search superseded this response
      if (rows.length === 0) {
        $results.innerHTML = '<li class="empty">No results.</li>';
        return;
      }
      $results.innerHTML = '';
      for (const r of rows) {
        const li = h(`
          <li><a href="javascript:void 0">
            <div class="title">${escapeHtml(r.title)}
              ${r.type ? `<span class="badge">${escapeHtml(r.type)}</span>` : ''}
            </div>
            <div class="meta">${escapeHtml(r.artist)}
              ${r.rating ? `<span class="rating">★ ${escapeHtml(r.rating)}</span> (${escapeHtml(r.votes ?? 0)})` : ''}
            </div>
          </a></li>`);
        li.querySelector('a').onclick = () => importTab(r, li);
        $results.append(li);
      }
    } catch (err) {
      if (my !== gen) return;
      $results.innerHTML = `<li class="empty error">${escapeHtml(err.message)}</li>`;
    }
  }

  async function importTab(r, li) {
    const a = li.querySelector('a');
    a.style.opacity = '0.5';
    try {
      const tab = await api(
        `/sources/${$source.value}/tab?url=` + encodeURIComponent(r.url)
      );
      // Hand the imported tab to the editor for review before saving.
      sessionStorage.setItem('opentabs.import', JSON.stringify(tab));
      location.hash = '#/new';
    } catch (err) {
      a.style.opacity = '';
      alert('Import failed: ' + err.message);
    }
  }

  const debouncedSearch = debounce(search, 500);
  $q.addEventListener('input', debouncedSearch);
  $q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { debouncedSearch.cancel(); search(); }
  });
  $q.focus();

  return () => debouncedSearch.cancel();
}
