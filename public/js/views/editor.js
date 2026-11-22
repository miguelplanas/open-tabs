import { $app, api, escapeHtml, warmSong } from '../app.js';
import { icon } from '../icons.js';
import { renderBody } from '../chords.js';
import { toast, confirmDialog } from '../ui.js';
import { oneAtATime } from '../busy.js';

const IMPORT_KEY = 'opentabs.import';
const EDIT_OFFLINE = 'Editing needs a connection to the server, so an old copy can’t overwrite newer changes.';

// Handles #/new (no id), #/edit/:id, and imports handed over from the
// online search view via sessionStorage.
export async function editorView([id]) {
  let song = { title: '', artist: '', body: '', capo: 0, tuning: '' };
  if (id) {
    // Never the saved offline copy: it may predate an edit made elsewhere,
    // and Save would overwrite that edit with it. The query string makes the
    // service worker skip its cache (it only stores and matches bare URLs).
    try {
      song = await api(`/songs/${id}?edit=1`);
    } catch (err) {
      if (err.message === 'unauthorized') return;
      $app.innerHTML = `<div class="empty error">${escapeHtml(EDIT_OFFLINE)}</div>`;
      return;
    }
  } else {
    // The import stays in sessionStorage until it is saved: a Save that fails
    // with no signal used to lose it.
    const draft = sessionStorage.getItem(IMPORT_KEY);
    if (draft) {
      try { song = { ...song, ...JSON.parse(draft) }; } catch { /* ignore bad draft */ }
    }
  }

  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back" aria-label="Back">${icon('chevron-left')}</button>
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

  document.getElementById('back').onclick = () => {
    if (!id) sessionStorage.removeItem(IMPORT_KEY); // backing out discards it
    location.hash = id ? '#/song/' + id : '#/';
  };

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

  // One request at a time: a double tap on Save created the song twice.
  const $save = document.getElementById('save');
  const send = oneAtATime($save, async (data) => {
    const saved = id
      ? await api('/songs/' + id, { method: 'PUT', body: data })
      : await api('/songs', { method: 'POST', body: data });
    warmSong(saved.id); // refresh the offline copy
    if (!id) sessionStorage.removeItem(IMPORT_KEY);
    location.hash = '#/song/' + saved.id;
  });

  function save() {
    const data = Object.fromEntries(new FormData($form));
    data.capo = Number(data.capo) || 0;
    if (!data.title.trim()) { $form.elements.title.focus(); return; }
    // Preserve provenance when editing an imported song.
    if (song.source) { data.source = song.source; data.source_url = song.source_url; }
    send(data).catch((err) => toast('Save failed: ' + err.message, { danger: true }));
  }
  $save.onclick = save;
  $form.onsubmit = (e) => { e.preventDefault(); save(); };

  const $del = document.getElementById('delete');
  if ($del) {
    $del.onclick = async () => {
      const ok = await confirmDialog(`Delete "${song.title}"? This cannot be undone.`, {
        danger: true,
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      try {
        await api('/songs/' + id, { method: 'DELETE' });
        location.hash = '#/';
      } catch (err) {
        if (err.message === 'unauthorized') return;
        toast('Delete failed: ' + err.message, { danger: true });
      }
    };
  }
}
