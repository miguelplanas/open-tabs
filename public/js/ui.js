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

// --- Song versions -------------------------------------------------------
// Several rows in `songs` are often the same song: a chord sheet and a tab
// arrangement, or two transcriptions of different quality. They are grouped for
// display by normalized title and artist (the same normalization as norm() in
// server/db.js). Nothing about the grouping is stored, so it recomputes itself
// whenever songs are imported, edited or deleted.

export const normalizeName = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const groupKey = (song) =>
  `${normalizeName(song.title)}|${normalizeName(song.artist)}`;

// Group a list of songs, keeping both the order the groups first appear in and
// the order of versions within each group. The server already sorts by
// played_at then updated_at, so the first version of a group is the one you
// reached for most recently: the right one to represent it.
export function groupVersions(songs) {
  const groups = new Map();
  for (const s of songs) {
    const key = groupKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.values()];
}

const KIND_LABELS = { tabs: 'Tabs', chords: 'Chords', lyrics: 'Lyrics' };
export const kindLabel = (kind) => KIND_LABELS[kind] || 'Tab';

// Ultimate Guitar spells standard tuning out in full, so both forms mean the
// same thing: nothing worth taking up space with.
const STANDARD_TUNINGS = new Set(['', 'standard', 'e a d g b e', 'eadgbe']);
export function tuningLabel(tuning) {
  const t = String(tuning ?? '').trim();
  return STANDARD_TUNINGS.has(t.toLowerCase()) ? '' : t;
}

// How one version reads in the picker: "Chords · capo 2 · Drop D".
export function versionLabel(song) {
  const bits = [kindLabel(song.kind)];
  if (song.capo) bits.push(`capo ${song.capo}`);
  const tuning = tuningLabel(song.tuning);
  if (tuning) bits.push(tuning);
  return bits.join(' · ');
}

// Choose which version of a song to open. Shared by the library (tapping a
// song that has more than one) and the reader (switching without going back).
// Needs only list columns, so it never loads a tab body.
export function versionPickerDialog(versions, { currentId = null } = {}) {
  const top = versions[0];
  const overlay = h(`
    <div class="confirm-overlay">
      <div class="confirm-box picker" role="dialog" aria-modal="true">
        <p>${escapeHtml(top.title)}<span class="count"> · ${
          escapeHtml(top.artist || 'Unknown artist')}</span></p>
        <ul class="picker-list" id="vp-list"></ul>
        <div class="confirm-actions">
          <button type="button" class="btn" id="vp-close">Cancel</button>
        </div>
      </div>
    </div>`);
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
  overlay.querySelector('#vp-close').onclick = close;

  const list = overlay.querySelector('#vp-list');
  for (const v of versions) {
    const current = v.id === currentId;
    const row = h(`
      <li class="picker-row${current ? ' member' : ''}">
        <span class="picker-name">${escapeHtml(versionLabel(v))}</span>
        ${current ? '<span class="picker-check">✓</span>' : ''}
      </li>`);
    row.onclick = () => {
      close();
      if (!current) location.hash = '#/song/' + v.id;
    };
    list.append(row);
  }
  return { close };
}

// Bottom sheet built around a caller-supplied element. Same visual language as
// the dialogs (scrim plus slide-up card) but it stays open and hands back a
// close(), so callers can host live controls that keep acting on the view
// behind it. Used by the reader's song tools.
export function openSheet(content) {
  const overlay = h(`
    <div class="confirm-overlay">
      <div class="confirm-box sheet" role="dialog" aria-modal="true"></div>
    </div>`);
  overlay.firstElementChild.append(content);
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
  return { close };
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
