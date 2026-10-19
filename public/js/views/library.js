import { $app, api, h, escapeHtml, debounce } from '../app.js';
import { icon } from '../icons.js';
import {
  groupVersions, versionPickerDialog, onLongPress, songActionsSheet,
} from '../ui.js';
import { onlineSearchHash } from '../search-route.js';
import {
  ORDERS, readOrder, sectionsByLetter, sectionsByArtist, letterAt, nearestPresent,
  compactLetters,
} from '../library-order.js';

// Same key as before the three-way order; readOrder() migrates what is there.
const PREFS_KEY = 'opentabs.libraryPrefs';

export async function libraryView() {
  // Songs opened from the plain library aren't part of a setlist.
  sessionStorage.removeItem('opentabs.setlist');
  $app.innerHTML = `
    <header class="topbar">
      <div class="topbar-row">
        <h1 class="brand">OpenTabs <span class="count" id="count"></span></h1>
        <button class="btn quiet theme-toggle" type="button" data-theme-toggle aria-label="Cambiar tema claro u oscuro"></button>
        <button class="btn primary" id="go-new">${icon('plus')} New</button>
      </div>
    </header>
    <main class="content">
      <input class="searchbox" id="q" type="search" placeholder="Search your library…" autocomplete="off">
      <div class="segments" id="order" role="radiogroup" aria-label="Order">${ORDERS.map((o) => `
        <button type="button" class="segment" role="radio" data-order="${o.id}">${o.label}</button>`).join('')}
      </div>
      <ul class="songlist" id="list"><li class="spinner">Loading…</li></ul>
    </main>
    <div class="az-index" id="az" aria-hidden="true" hidden><div class="az-strip" id="az-strip"></div></div>
    <div class="az-bubble" id="az-bubble" aria-hidden="true" hidden></div>`;

  document.getElementById('go-new').onclick = () => (location.hash = '#/new');

  const $q = document.getElementById('q');
  const $list = document.getElementById('list');
  const $order = document.getElementById('order');
  const $az = document.getElementById('az');
  const $bubble = document.getElementById('az-bubble');
  const $strip = document.getElementById('az-strip');

  // Restore the order the owner last used.
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY)); } catch { /* ignore */ }
  let order = readOrder(prefs);
  let all = [];

  function paintOrder() {
    for (const b of $order.querySelectorAll('.segment')) {
      const on = b.dataset.order === order;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
  paintOrder();

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ order })); } catch { /* private mode */ }
  }

  // Sticky section headers stop under the sticky top bar, whose height
  // depends on the safe area, so it is measured rather than guessed.
  const $topbar = $app.querySelector('.topbar');
  const stickTop = () => $topbar.getBoundingClientRect().height;
  function measure() {
    $list.style.setProperty('--stick', `${stickTop()}px`);
    $az.style.top = `${stickTop() + 8}px`;
  }
  measure();

  function render() {
    // One row per song, not per row in the database: the versions of a song
    // (a chord sheet and a tab of it, two transcriptions) collapse into one
    // entry. Sorting and artist grouping act on each group's representative,
    // which is the version the server put first, so the most recently played
    // or edited one speaks for the group.
    const groups = groupVersions(all);
    $az.hidden = true;

    const q = $q.value.trim();
    if (groups.length === 0) {
      $list.innerHTML = `<li class="empty"><div class="strings"></div>${
        q ? 'No songs match.' : 'Your library is empty.<br>Add a song, or search online to import one.'
      }</li>`;
      if (q) $list.append(searchOnlineItem(q));
      return;
    }

    $list.innerHTML = '';
    $list.classList.toggle('with-index', order === 'az');
    if (order === 'recent') {
      // Server order: most recently played, then edited, first.
      for (const g of groups) $list.append(songItem(g, false, dropSong));
    } else {
      const sections = order === 'az' ? sectionsByLetter(groups) : sectionsByArtist(groups);
      const frag = document.createDocumentFragment();
      // Each section is its own box, so its sticky header leaves with it
      // instead of piling up under the next one.
      for (const sec of sections) {
        const box = h(`<li class="section"><div class="group-header">${escapeHtml(sec.key)}</div><ul></ul></li>`);
        if (order === 'az') box.firstElementChild.dataset.letter = sec.key;
        const $ul = box.lastElementChild;
        for (const g of sec.items) $ul.append(songItem(g, order === 'artist', dropSong));
        frag.append(box);
      }
      $list.append(frag);
      if (order === 'az') paintIndex(new Set(sections.map((sec) => sec.key)));
    }
    if (q) $list.append(searchOnlineItem(q));
  }

  // Last row of a filtered library: the same query, run online.
  function searchOnlineItem(q) {
    const li = h(`<li class="search-online"><a></a></li>`);
    const a = li.querySelector('a');
    a.href = onlineSearchHash(q);
    a.innerHTML = `<span>Search “${escapeHtml(q)}” online</span>${icon('chevron-right')}`;
    return li;
  }

  // --- A-Z index -------------------------------------------------------
  // The letters down the right edge, like the iOS contacts list: touch or
  // drag over them to jump to that letter, with a big letter in the middle
  // of the screen while the finger is down. Letters with no songs stay, dimmed,
  // so every letter keeps its place under the finger.
  let present = new Set();
  function paintIndex(have) {
    present = have;
    $az.hidden = false;
    // Letters take 16px each; fewer slots than letters means a short
    // screen (a phone on its side), where every other letter gives way to a dot.
    const slots = Math.floor(($az.getBoundingClientRect().height - 12) / 16);
    $strip.innerHTML = compactLetters(slots)
      .map((c) => (c === '•'
        ? '<span class="az-dot" aria-hidden="true">•</span>'
        : `<span class="az-letter${have.has(c) ? '' : ' off'}">${c}</span>`))
      .join('');
  }

  function jumpTo(letter) {
    $bubble.textContent = letter;
    const target = nearestPresent(letter, present);
    const head = target && $list.querySelector(`.group-header[data-letter="${CSS.escape(target)}"]`);
    if (!head) return;
    window.scrollTo(0, head.getBoundingClientRect().top + window.scrollY - stickTop());
  }

  function fromPointer(e) {
    const r = $strip.getBoundingClientRect();
    jumpTo(letterAt(e.clientY - r.top, r.height));
  }
  let dragging = false;
  $strip.addEventListener('pointerdown', (e) => {
    dragging = true;
    $strip.setPointerCapture(e.pointerId);
    $bubble.hidden = false;
    fromPointer(e);
    e.preventDefault();
  });
  $strip.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const endDrag = () => { dragging = false; $bubble.hidden = true; };
  $strip.addEventListener('pointerup', endDrag);
  $strip.addEventListener('pointercancel', endDrag);
  $strip.addEventListener('lostpointercapture', endDrag);

  // Rotating the phone changes how many letters fit.
  const onResize = debounce(() => {
    measure();
    if (!$az.hidden) paintIndex(present);
  }, 150);
  window.addEventListener('resize', onResize);

  // Songs, not rows: a song with three versions counts once. Only meaningful
  // over the whole library, so a filtered list leaves the header alone.
  function renderCount() {
    if ($q.value.trim()) return;
    const n = groupVersions(all).length;
    document.getElementById('count').textContent =
      n > 0 ? `[${n}]` : '';
  }

  // A version deleted from the action sheet is already gone on the server, so
  // drop it here rather than refetching: the list keeps its scroll position.
  function dropSong(song) {
    all = all.filter((s) => s.id !== song.id);
    renderCount();
    render();
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
      renderCount();
      render();
    } catch (err) {
      if (my === gen && err.message !== 'unauthorized') {
        $list.innerHTML = `<li class="empty error">${escapeHtml(err.message)}</li>`;
      }
    }
  }

  const debouncedLoad = debounce(load, 200);
  $q.addEventListener('input', debouncedLoad);
  $order.onclick = (e) => {
    const b = e.target.closest('.segment');
    if (!b || b.dataset.order === order) return;
    order = b.dataset.order;
    paintOrder();
    savePrefs();
    render();
  };
  await load();

  return () => {
    debouncedLoad.cancel();
    onResize.cancel();
    window.removeEventListener('resize', onResize);
  };
}

// `versions` is a group: one song, one or more rows. A single version behaves
// exactly as before (a plain link); several open the picker instead, so the
// choice of version happens before the reader, not inside it. Holding the row
// opens what you can do with the song instead of opening it.
function songItem(versions, hideArtist, onDeleted) {
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
  const a = li.querySelector('a');
  if (many) a.onclick = () => versionPickerDialog(versions);
  onLongPress(a, () => songActionsSheet(versions, { onDeleted }));
  return li;
}
