import { $app, api, h, escapeHtml } from '../app.js';
import { promptDialog, confirmDialog, toast } from '../ui.js';

const SETLIST_KEY = 'opentabs.setlist';

// Single collection: ordered songs with reorder/remove, add-songs picker,
// rename/delete, and a "play through" that opens the first song in setlist mode
// (the reader then offers prev/next through the list).
export async function collectionView([id]) {
  let col;
  try {
    col = await api('/collections/' + id);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    $app.innerHTML = `<div class="empty error">${escapeHtml(err.message)}</div>`;
    return;
  }

  let editing = false;

  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back">←</button>
      <h1 id="title"></h1>
      <button class="btn icon" id="rename" title="Rename">✏️</button>
    </header>
    <main class="content">
      <p class="col-desc" id="desc" hidden></p>
      <div class="toolbar">
        <button class="btn primary" id="play" title="Play through">▶ Play through</button>
        <button class="btn" id="add">+ Add songs</button>
        <button class="btn" id="edit-toggle" aria-pressed="false">Reorder</button>
      </div>
      <ul class="songlist" id="list"></ul>
      <div class="col-danger">
        <button type="button" class="btn-quiet" id="delete">Delete collection</button>
      </div>
    </main>`;

  const $list = document.getElementById('list');
  const $title = document.getElementById('title');
  const $desc = document.getElementById('desc');
  const $play = document.getElementById('play');

  document.getElementById('back').onclick = () => (location.hash = '#/collections');

  function renderHeader() {
    $title.textContent = col.name;
    $desc.hidden = !col.description;
    $desc.textContent = col.description || '';
    $play.hidden = col.songs.length === 0;
  }

  function renderList() {
    if (col.songs.length === 0) {
      $list.innerHTML = `<li class="empty">No songs yet.<br>Use “+ Add songs” to fill this collection.</li>`;
      return;
    }
    $list.innerHTML = '';
    col.songs.forEach((s, i) => {
      const controls = editing
        ? `<div class="row-ctrl">
             <button class="btn icon reorder" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
             <button class="btn icon reorder" data-act="down" ${i === col.songs.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
             <button class="btn icon reorder danger" data-act="remove" title="Remove">✕</button>
           </div>`
        : '';
      const li = h(`
        <li class="col-song${editing ? ' editing' : ''}">
          <a class="col-song-main" href="${editing ? 'javascript:void 0' : '#/song/' + s.id}">
            <div class="title">${escapeHtml(s.title)}${
              s.capo ? `<span class="badge">capo ${s.capo}</span>` : ''}</div>
            <div class="meta">${escapeHtml(s.artist || 'Unknown artist')}</div>
          </a>
          ${controls}
        </li>`);
      if (!editing) {
        li.querySelector('a').onclick = () => saveSetlist();
      } else {
        li.querySelector('a').onclick = (e) => e.preventDefault();
        for (const btn of li.querySelectorAll('.reorder')) {
          btn.onclick = () => handleRowAction(btn.dataset.act, i);
        }
      }
      $list.append(li);
    });
  }

  // Persist the current order so the reader can offer prev/next through it.
  function saveSetlist() {
    sessionStorage.setItem(SETLIST_KEY, JSON.stringify({
      id: col.id, name: col.name, ids: col.songs.map((s) => s.id),
    }));
  }

  async function handleRowAction(act, i) {
    if (act === 'remove') {
      const s = col.songs[i];
      try {
        await api(`/collections/${col.id}/songs/${s.id}`, { method: 'DELETE' });
        col.songs.splice(i, 1);
        renderHeader();
        renderList();
      } catch (err) {
        if (err.message !== 'unauthorized') toast('Failed: ' + err.message, { danger: true });
      }
      return;
    }
    const j = act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= col.songs.length) return;
    [col.songs[i], col.songs[j]] = [col.songs[j], col.songs[i]];
    renderList();
    try {
      await api(`/collections/${col.id}/songs`, {
        method: 'PUT', body: { order: col.songs.map((s) => s.id) },
      });
    } catch (err) {
      if (err.message !== 'unauthorized') toast('Reorder failed: ' + err.message, { danger: true });
    }
  }

  document.getElementById('edit-toggle').onclick = (e) => {
    editing = !editing;
    e.currentTarget.classList.toggle('active', editing);
    e.currentTarget.setAttribute('aria-pressed', String(editing));
    e.currentTarget.textContent = editing ? 'Done' : 'Reorder';
    renderList();
  };

  $play.onclick = () => {
    if (col.songs.length === 0) return;
    saveSetlist();
    location.hash = '#/song/' + col.songs[0].id;
  };

  document.getElementById('rename').onclick = async () => {
    const name = await promptDialog('Rename collection', { value: col.name, confirmLabel: 'Save' });
    if (!name || name === col.name) return;
    try {
      const updated = await api('/collections/' + col.id, { method: 'PUT', body: { name } });
      col.name = updated.name;
      renderHeader();
    } catch (err) {
      if (err.message !== 'unauthorized') toast('Rename failed: ' + err.message, { danger: true });
    }
  };

  document.getElementById('delete').onclick = async () => {
    const ok = await confirmDialog(`Delete collection “${col.name}”? The songs themselves are kept.`, {
      danger: true, confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api('/collections/' + col.id, { method: 'DELETE' });
      location.hash = '#/collections';
    } catch (err) {
      if (err.message !== 'unauthorized') toast('Delete failed: ' + err.message, { danger: true });
    }
  };

  document.getElementById('add').onclick = () => addSongsDialog();

  // Picker of library songs to add to this collection, with live filtering.
  async function addSongsDialog() {
    let all;
    try {
      all = await api('/songs');
    } catch (err) {
      if (err.message !== 'unauthorized') toast('Could not load songs: ' + err.message, { danger: true });
      return;
    }
    const inCol = new Set(col.songs.map((s) => s.id));

    const overlay = h(`
      <div class="confirm-overlay">
        <div class="confirm-box picker" role="dialog" aria-modal="true">
          <p>Add songs to <strong>${escapeHtml(col.name)}</strong></p>
          <input type="search" class="prompt-input" id="pk-q" placeholder="Filter your library…" autocomplete="off">
          <ul class="picker-list" id="pk-list"></ul>
          <div class="confirm-actions">
            <button type="button" class="btn primary" id="pk-done">Done</button>
          </div>
        </div>
      </div>`);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const $q = overlay.querySelector('#pk-q');
    const $pkList = overlay.querySelector('#pk-list');

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('show');
      const remove = () => overlay.remove();
      overlay.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 400);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#pk-done').onclick = close;

    function renderPicker() {
      const q = $q.value.trim().toLowerCase();
      const rows = all.filter((s) =>
        !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q));
      $pkList.innerHTML = '';
      if (rows.length === 0) {
        $pkList.innerHTML = '<li class="picker-empty">No songs match.</li>';
        return;
      }
      for (const s of rows) {
        const member = inCol.has(s.id);
        const row = h(`
          <li class="picker-row${member ? ' member' : ''}">
            <span class="picker-name">${escapeHtml(s.title)}<span class="count"> · ${escapeHtml(s.artist || 'Unknown')}</span></span>
            <span class="picker-check">${member ? '✓' : '+'}</span>
          </li>`);
        row.onclick = async () => {
          row.style.pointerEvents = 'none';
          try {
            if (inCol.has(s.id)) {
              await api(`/collections/${col.id}/songs/${s.id}`, { method: 'DELETE' });
              inCol.delete(s.id);
              col.songs = col.songs.filter((x) => x.id !== s.id);
            } else {
              await api(`/collections/${col.id}/songs`, { method: 'POST', body: { song_id: s.id } });
              inCol.add(s.id);
              col.songs.push(s);
            }
            renderHeader();
            renderList();
            renderPicker();
          } catch (err) {
            row.style.pointerEvents = '';
            if (err.message !== 'unauthorized') toast('Failed: ' + err.message, { danger: true });
          }
        };
        $pkList.append(row);
      }
    }
    $q.addEventListener('input', renderPicker);
    renderPicker();
    $q.focus();
  }

  renderHeader();
  renderList();
}
