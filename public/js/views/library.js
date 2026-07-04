import { $app, api, h, escapeHtml, debounce } from '../app.js';

export async function libraryView() {
  $app.innerHTML = `
    <header class="topbar">
      <h1>OpenTabs</h1>
      <button class="btn icon" id="go-search" title="Search online">🌐</button>
      <button class="btn primary" id="go-new">+ New</button>
    </header>
    <main class="content">
      <input class="searchbox" id="q" type="search" placeholder="Search your library…" autocomplete="off">
      <ul class="songlist" id="list"><li class="spinner">Loading…</li></ul>
    </main>`;

  document.getElementById('go-new').onclick = () => (location.hash = '#/new');
  document.getElementById('go-search').onclick = () => (location.hash = '#/search');

  const $q = document.getElementById('q');
  const $list = document.getElementById('list');

  let gen = 0;
  async function load() {
    const my = ++gen;
    try {
      const songs = await api('/songs?q=' + encodeURIComponent($q.value.trim()));
      if (my !== gen) return; // a newer search superseded this response
      if (songs.length === 0) {
        $list.innerHTML = `<li class="empty">${
          $q.value ? 'No songs match.' : 'Your library is empty.<br>Add a song or search online 🌐'
        }</li>`;
        return;
      }
      $list.innerHTML = '';
      for (const s of songs) {
        $list.append(h(`
          <li><a href="#/song/${s.id}">
            <div class="title">${escapeHtml(s.title)}${
              s.capo ? `<span class="badge">capo ${s.capo}</span>` : ''
            }${s.source ? `<span class="badge">${escapeHtml(s.source)}</span>` : ''}</div>
            <div class="meta">${escapeHtml(s.artist || 'Unknown artist')}</div>
          </a></li>`));
      }
    } catch (err) {
      if (my === gen && err.message !== 'unauthorized') {
        $list.innerHTML = `<li class="empty error">${escapeHtml(err.message)}</li>`;
      }
    }
  }

  const debouncedLoad = debounce(load, 200);
  $q.addEventListener('input', debouncedLoad);
  await load();

  return () => debouncedLoad.cancel();
}
