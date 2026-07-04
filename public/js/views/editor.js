import { $app, api, escapeHtml } from '../app.js';
import { renderBody } from '../chords.js';

// Handles #/new (no id), #/edit/:id, and imports handed over from the
// online search view via sessionStorage.
export async function editorView([id]) {
  let song = { title: '', artist: '', body: '', capo: 0, tuning: '', tags: '' };
  if (id) {
    try {
      song = await api('/songs/' + id);
    } catch (err) {
      if (err.message === 'unauthorized') return;
      $app.innerHTML = `<div class="empty error">${escapeHtml(err.message)}</div>`;
      return;
    }
  } else {
    const draft = sessionStorage.getItem('opentabs.import');
    if (draft) {
      sessionStorage.removeItem('opentabs.import');
      try { song = { ...song, ...JSON.parse(draft) }; } catch { /* ignore bad draft */ }
    }
  }

  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back">←</button>
      <h1>${id ? 'Edit song' : 'New song'}</h1>
      <button class="btn" id="preview-toggle">Preview</button>
      <button class="btn primary" id="save">Save</button>
    </header>
    <main class="content editor">
      <form id="form">
        <div class="row">
          <label class="f">Title
            <input name="title" required value="${escapeHtml(song.title)}" placeholder="Song title">
          </label>
          <label class="f">Artist
            <input name="artist" value="${escapeHtml(song.artist)}" placeholder="Artist">
          </label>
        </div>
        <div class="row">
          <label class="f">Capo
            <input name="capo" type="number" min="0" max="12" value="${song.capo || 0}">
          </label>
          <label class="f">Tuning
            <input name="tuning" value="${escapeHtml(song.tuning || '')}" placeholder="Standard">
          </label>
          <label class="f">Tags
            <input name="tags" value="${escapeHtml(song.tags || '')}" placeholder="acoustic, campfire">
          </label>
        </div>
        <label class="f">Tab (paste chords over lyrics or ASCII tab)
          <textarea name="body" spellcheck="false" placeholder="[Verse]&#10;C        G&#10;Lyrics go here…">${escapeHtml(song.body)}</textarea>
        </label>
        <pre class="tabbody" id="preview" hidden style="padding-bottom:14px"></pre>
        <div class="actions">
          ${id ? '<button type="button" class="btn danger" id="delete">Delete song</button>' : '<span></span>'}
        </div>
      </form>
    </main>`;

  const $form = document.getElementById('form');
  const $preview = document.getElementById('preview');
  const $ta = $form.elements.body;

  document.getElementById('back').onclick = () =>
    (location.hash = id ? '#/song/' + id : '#/');

  document.getElementById('preview-toggle').onclick = () => {
    const showing = !$preview.hidden;
    if (showing) {
      $preview.hidden = true;
      $ta.parentElement.style.display = '';
    } else {
      $preview.innerHTML = renderBody($ta.value, 0);
      $preview.hidden = false;
      $ta.parentElement.style.display = 'none';
    }
  };

  async function save() {
    const data = Object.fromEntries(new FormData($form));
    data.capo = Number(data.capo) || 0;
    if (!data.title.trim()) { $form.elements.title.focus(); return; }
    // Preserve provenance when editing an imported song.
    if (song.source) { data.source = song.source; data.source_url = song.source_url; }
    try {
      const saved = id
        ? await api('/songs/' + id, { method: 'PUT', body: data })
        : await api('/songs', { method: 'POST', body: data });
      location.hash = '#/song/' + saved.id;
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  }
  document.getElementById('save').onclick = save;
  $form.onsubmit = (e) => { e.preventDefault(); save(); };

  const $del = document.getElementById('delete');
  if ($del) {
    $del.onclick = async () => {
      if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return;
      try {
        await api('/songs/' + id, { method: 'DELETE' });
        location.hash = '#/';
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    };
  }
}
