import { $app, api, escapeHtml } from '../app.js';
import { renderBody } from '../chords.js';
import { toast } from '../ui.js';

const DRAFT_KEY = 'opentabs.import';

// Renders an imported tab exactly like the reader so the user can judge it
// before it enters the library. The draft stays in sessionStorage until Save
// or Edit consumes it, so going back to search and re-previewing is cheap.
export async function previewView() {
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch { /* fall through */ }
  if (!draft || typeof draft.body !== 'string') {
    location.hash = '#/';
    return;
  }

  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back to search">←</button>
      <h1>${escapeHtml(draft.title || 'Untitled')}
        <span class="sub">${escapeHtml(draft.artist || '')}${
          draft.capo ? ` · capo ${draft.capo}` : ''}${
          draft.tuning && draft.tuning.toLowerCase() !== 'standard' ? ` · ${escapeHtml(draft.tuning)}` : ''}</span>
      </h1>
      <span class="badge">preview</span>
    </header>
    <div class="notice" id="dupe" hidden></div>
    <pre class="tabbody" id="body"></pre>
    <div class="preview-pad"></div>
    <div class="reader-controls">
      <button class="btn" id="edit">Edit first</button>
      <button class="btn primary grow" id="save">Save to library</button>
    </div>`;

  document.getElementById('body').innerHTML = renderBody(draft.body, 0);
  document.getElementById('back').onclick = () => (location.hash = '#/search');

  // Non-blocking duplicate check: same normalized title + artist already saved.
  const norm = (s) => (s || '').trim().toLowerCase();
  api('/songs?q=' + encodeURIComponent((draft.title || '').trim()))
    .then((rows) => {
      const dupe = rows.find(
        (s) => norm(s.title) === norm(draft.title) && norm(s.artist) === norm(draft.artist)
      );
      if (!dupe) return;
      const $dupe = document.getElementById('dupe');
      if (!$dupe) return; // view already replaced
      $dupe.hidden = false;
      $dupe.innerHTML = `Already in your library: <a href="#/song/${dupe.id}">open the saved version</a>. Saving again keeps both.`;
    })
    .catch(() => { /* duplicate hint is best-effort */ });

  document.getElementById('edit').onclick = () => {
    // The editor picks the draft up from the same sessionStorage key.
    location.hash = '#/new';
  };

  const $save = document.getElementById('save');
  $save.onclick = async () => {
    $save.disabled = true;
    const data = {
      title: draft.title || 'Untitled',
      artist: draft.artist || '',
      body: draft.body,
      capo: Number(draft.capo) || 0,
      tuning: draft.tuning || '',
    };
    if (draft.source) { data.source = draft.source; data.source_url = draft.source_url; }
    try {
      const saved = await api('/songs', { method: 'POST', body: data });
      sessionStorage.removeItem(DRAFT_KEY);
      location.hash = '#/song/' + saved.id;
    } catch (err) {
      $save.disabled = false;
      toast('Save failed: ' + err.message, { danger: true });
    }
  };
}
