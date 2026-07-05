import { h, escapeHtml, api } from './app.js';

let toastRoot;
function toastStack() {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toast-stack';
    document.body.append(toastRoot);
  }
  return toastRoot;
}

export function toast(message, { danger = false, duration = 3200 } = {}) {
  const el = h(`<div class="toast${danger ? ' danger' : ''}">${escapeHtml(message)}</div>`);
  toastStack().append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const remove = () => el.remove();
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400); // fallback for prefers-reduced-motion, where transitionend never fires
  }, duration);
}

// Promise-based text prompt matching the app's visual language. Resolves to the
// entered string (trimmed) or null if cancelled.
export function promptDialog(message, {
  value = '', placeholder = '', confirmLabel = 'Save', cancelLabel = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    const overlay = h(`
      <div class="confirm-overlay">
        <div class="confirm-box" role="dialog" aria-modal="true">
          <p>${escapeHtml(message)}</p>
          <input type="text" class="prompt-input" id="p-input" placeholder="${escapeHtml(placeholder)}">
          <div class="confirm-actions">
            <button type="button" class="btn" id="p-cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="btn primary" id="p-ok">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>`);
    document.body.append(overlay);
    const input = overlay.querySelector('#p-input');
    input.value = value;
    requestAnimationFrame(() => { overlay.classList.add('show'); input.focus(); input.select(); });

    function close(result) {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('show');
      const remove = () => overlay.remove();
      overlay.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 400);
      resolve(result);
    }
    function submit() {
      const v = input.value.trim();
      close(v === '' ? null : v);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector('#p-cancel').onclick = () => close(null);
    overlay.querySelector('#p-ok').onclick = submit;
  });
}

// "Add to collection" picker for a single song. Fetches the song's collections
// (with membership flags), lets the user toggle membership, and offers to create
// a new collection inline. Persists each toggle immediately.
export async function addToCollectionDialog(song) {
  let cols;
  try {
    cols = await api('/collections?song=' + song.id);
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not load collections: ' + err.message, { danger: true });
    return;
  }

  const overlay = h(`
    <div class="confirm-overlay">
      <div class="confirm-box picker" role="dialog" aria-modal="true">
        <p>Add <strong>${escapeHtml(song.title)}</strong> to…</p>
        <ul class="picker-list" id="pk-list"></ul>
        <button type="button" class="btn picker-new" id="pk-new">+ New collection</button>
        <div class="confirm-actions">
          <button type="button" class="btn primary" id="pk-done">Done</button>
        </div>
      </div>
    </div>`);
  const list = overlay.querySelector('#pk-list');
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

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

  function renderRow(col) {
    const row = h(`
      <li class="picker-row${col.member ? ' member' : ''}">
        <span class="picker-name">${escapeHtml(col.name)}<span class="count"> · ${col.song_count}</span></span>
        <span class="picker-check">${col.member ? '✓' : '+'}</span>
      </li>`);
    row.onclick = async () => {
      const wasMember = col.member;
      row.style.pointerEvents = 'none';
      try {
        if (wasMember) {
          await api(`/collections/${col.id}/songs/${song.id}`, { method: 'DELETE' });
          col.song_count--;
        } else {
          await api(`/collections/${col.id}/songs`, { method: 'POST', body: { song_id: song.id } });
          col.song_count++;
        }
        col.member = !wasMember;
        row.replaceWith(renderRow(col));
      } catch (err) {
        row.style.pointerEvents = '';
        if (err.message !== 'unauthorized') toast('Failed: ' + err.message, { danger: true });
      }
    };
    return row;
  }

  function renderList() {
    list.innerHTML = '';
    if (cols.length === 0) {
      list.innerHTML = '<li class="picker-empty">No collections yet.</li>';
      return;
    }
    for (const col of cols) list.append(renderRow(col));
  }
  renderList();

  overlay.querySelector('#pk-new').onclick = async () => {
    const name = await promptDialog('Name the new collection', { placeholder: 'e.g. Campfire set', confirmLabel: 'Create' });
    if (!name) return;
    try {
      const created = await api('/collections', { method: 'POST', body: { name } });
      await api(`/collections/${created.id}/songs`, { method: 'POST', body: { song_id: song.id } });
      cols.unshift({ ...created, song_count: 1, member: 1 });
      renderList();
    } catch (err) {
      if (err.message !== 'unauthorized') toast('Failed: ' + err.message, { danger: true });
    }
  };
}

// Segmented Songs/Collections switcher shared by the two top-level list views.
// `active` is 'songs' or 'collections'; navigates via hash on click.
export function segmentNav(active) {
  const nav = h(`
    <nav class="segments" role="tablist" aria-label="Library sections">
      <button class="segment${active === 'songs' ? ' active' : ''}" role="tab" data-hash="#/">Songs</button>
      <button class="segment${active === 'collections' ? ' active' : ''}" role="tab" data-hash="#/collections">Collections</button>
    </nav>`);
  for (const btn of nav.querySelectorAll('.segment')) {
    btn.setAttribute('aria-selected', String(btn.classList.contains('active')));
    btn.onclick = () => { if (!btn.classList.contains('active')) location.hash = btn.dataset.hash; };
  }
  return nav;
}

// Promise-based replacement for confirm() that matches the app's visual language.
export function confirmDialog(message, { danger = false, confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const overlay = h(`
      <div class="confirm-overlay">
        <div class="confirm-box" role="alertdialog" aria-modal="true">
          <p>${escapeHtml(message)}</p>
          <div class="confirm-actions">
            <button type="button" class="btn" id="c-cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? 'danger-solid' : 'primary'}" id="c-ok">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>`);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    function close(result) {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('show');
      const remove = () => overlay.remove();
      overlay.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 400);
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') close(false); }

    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('#c-cancel').onclick = () => close(false);
    overlay.querySelector('#c-ok').onclick = () => close(true);
  });
}
