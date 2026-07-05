import { $app, api, h, escapeHtml } from '../app.js';
import { promptDialog, segmentNav, toast } from '../ui.js';

// Top-level list of collections (folders/albums/setlists).
export async function collectionsView() {
  $app.innerHTML = `
    <header class="topbar">
      <h1>OpenTabs</h1>
      <button class="btn primary" id="new-col">+ New</button>
    </header>
    <main class="content">
      <div id="seg"></div>
      <ul class="songlist" id="list"><li class="spinner">Loading…</li></ul>
    </main>`;

  document.getElementById('seg').append(segmentNav('collections'));
  const $list = document.getElementById('list');

  async function load() {
    try {
      const cols = await api('/collections');
      render(cols);
    } catch (err) {
      if (err.message !== 'unauthorized') {
        $list.innerHTML = `<li class="empty error">${escapeHtml(err.message)}</li>`;
      }
    }
  }

  function render(cols) {
    if (cols.length === 0) {
      $list.innerHTML = `<li class="empty"><div class="strings"></div>
        No collections yet.<br>Group songs into albums, folders or setlists.</li>`;
      return;
    }
    $list.innerHTML = '';
    for (const c of cols) {
      const li = h(`
        <li><a href="#/collection/${c.id}">
          <div class="title">${escapeHtml(c.name)}
            <span class="count">${c.song_count} ${c.song_count === 1 ? 'song' : 'songs'}</span>
          </div>
          ${c.description ? `<div class="meta">${escapeHtml(c.description)}</div>` : ''}
        </a></li>`);
      $list.append(li);
    }
  }

  document.getElementById('new-col').onclick = async () => {
    const name = await promptDialog('Name the new collection', { placeholder: 'e.g. Campfire set', confirmLabel: 'Create' });
    if (!name) return;
    try {
      const created = await api('/collections', { method: 'POST', body: { name } });
      location.hash = '#/collection/' + created.id;
    } catch (err) {
      if (err.message !== 'unauthorized') toast('Failed: ' + err.message, { danger: true });
    }
  };

  await load();
}
