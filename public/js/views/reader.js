import { $app, api, escapeHtml, h } from '../app.js';
import { renderBody, fitChars } from '../chords.js';
import {
  addToCollectionDialog, openSheet, versionPickerDialog,
  groupKey, kindLabel, tuningLabel,
} from '../ui.js';
import { enableChordPopovers, hideChordPopover } from '../chord-shapes.js';

// Autoscroll speed is persisted per song in pixels/second, but the reader
// exposes it as a 1..20 "level": the dock then has memorable steps and the
// slider a small set of them. Level 1 is a slow crawl, level 20 a brisk
// 40 px/s; the default is deliberately gentle.
const PX_PER_LEVEL = 2;
const MIN_LEVEL = 1;
const MAX_LEVEL = 20;
const DEFAULT_SPEED = 6; // px/s, matches the server-side default
const levelToSpeed = (lvl) => lvl * PX_PER_LEVEL;
const speedToLevel = (px) =>
  Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(px / PX_PER_LEVEL)));

// Floor for the fit-to-width shrink. Text below this is not readable at
// arm's length on a music stand, so the fit stops here and the few lines that
// still overflow scroll sideways instead of shrinking the whole song.
const MIN_FIT_FONT = 11;
const MIN_FONT = 9;
const MAX_FONT = 24;

// The screen stays awake for as long as the reader is open, not only while
// autoscroll runs: reaching the last line does not mean you stopped playing,
// and that was exactly when the phone used to lock. Insurance against leaving
// the app open on the stand: with nothing playing and nothing touched for
// this long, let the phone sleep.
const WAKE_IDLE_MS = 20 * 60 * 1000;

// How long the dock stays fully visible after you touch it while playing.
const DOCK_DIM_MS = 2600;

export async function readerView([id]) {
  let song;
  try {
    song = await api('/songs/' + id);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    $app.innerHTML = `<div class="empty error">${escapeHtml(err.message)}</div>`;
    return;
  }

  // Setlist context, if this song was opened from a collection ("play through"
  // or a row tap): enables prev/next navigation and a back-to-collection.
  let setlist = null;
  try { setlist = JSON.parse(sessionStorage.getItem('opentabs.setlist')); } catch { /* ignore */ }
  const setIdx = setlist && Array.isArray(setlist.ids) ? setlist.ids.indexOf(Number(id)) : -1;
  const inSetlist = setIdx >= 0;
  const backHash = inSetlist ? '#/collection/' + setlist.id : '#/';

  let transpose = song.transpose || 0;
  let speed = song.scroll_speed || DEFAULT_SPEED; // pixels per second
  let level = speedToLevel(speed);
  let fontSize = Number(localStorage.getItem('opentabs.fontSize')) || 14;
  let playing = false;
  let wakeLock = null;
  let wakeIdle = null;
  let dimT = null;
  let raf = null;
  let dirty = false;

  // Width the font is fitted to, in characters: ignores tab staves (they get
  // their own horizontal scroll) and tolerates the odd over-long line.
  const bodyText = (song.body || '').replace(/\s+$/, '');
  const fitTarget = fitChars(bodyText);

  // Other versions of this same song, filled in below. Starts as just this one
  // so everything can render before the list arrives.
  let versions = [song];

  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back">←</button>
      <h1>${escapeHtml(song.title)}
        <span class="sub" id="sub"></span>
      </h1>
      <button class="btn icon" id="tools" title="Song tools" aria-haspopup="dialog">⋯</button>
    </header>
    ${inSetlist ? `
    <div class="setlist-bar">
      <button class="btn icon" id="prev" title="Previous" ${setIdx === 0 ? 'disabled' : ''}>‹</button>
      <span class="setlist-info">${escapeHtml(setlist.name)} <span class="count">${setIdx + 1}/${setlist.ids.length}</span></span>
      <button class="btn icon" id="next" title="Next" ${setIdx === setlist.ids.length - 1 ? 'disabled' : ''}>›</button>
    </div>` : ''}
    <div class="fret-rail" aria-hidden="true">
      <span class="fd" style="top:25%"></span>
      <span class="fd" style="top:41.7%"></span>
      <span class="fd" style="top:58.3%"></span>
      <span class="fd" style="top:75%"></span>
      <span class="fd fd-oct" style="top:100%"></span>
      <span class="fret-here" id="progress"></span>
    </div>
    <pre class="tabbody" id="body"></pre>
    <div class="songend strings"></div>
    ${inSetlist && setIdx < setlist.ids.length - 1 ? `
    <button class="btn primary next-song" id="next-song" hidden>
      Next: ${escapeHtml(setlist.titles?.[setIdx + 1] || 'next song')} ›
    </button>` : ''}
    <div class="reader-dock" id="dock">
      <div class="dock-speed">
        <button id="spd-down" aria-label="Scroll slower">−</button>
        <span class="dock-level" id="lvl" title="Autoscroll speed" aria-live="polite"></span>
        <button id="spd-up" aria-label="Scroll faster">+</button>
      </div>
      <button class="btn primary icon play" id="play" title="Autoscroll" aria-label="Start autoscroll">▶</button>
    </div>`;

  const $body = document.getElementById('body');
  const $play = document.getElementById('play');
  const $dock = document.getElementById('dock');
  const $lvl = document.getElementById('lvl');
  const $sub = document.getElementById('sub');
  const $progress = document.getElementById('progress');

  // In a setlist, surface "Next: …" once the reader hits the end of the song,
  // so advancing never requires scrolling back to the top bar.
  const $next = document.getElementById('next-song');

  // The scroll position at which the song is "done": the last line has reached
  // just above the dock. Autoscroll and the progress dot both stop here rather
  // than at the document bottom, so no blank tail scrolls past.
  let endLimit = Infinity;

  function updateProgress() {
    const max = Number.isFinite(endLimit) && endLimit > 0
      ? endLimit
      : Math.max(0, document.body.scrollHeight - window.innerHeight);
    const y = Math.min(window.scrollY, max);
    $progress.style.top = (max > 0 ? (100 * y) / max : 0) + '%';
    if ($next) $next.hidden = window.scrollY < max - 40;
  }
  window.addEventListener('scroll', updateProgress, { passive: true });

  // Width of one monospace character at the current font size, measured with
  // an off-screen probe. Character counts then predict line widths without a
  // layout pass, and without being thrown off by the scrollable tab blocks.
  function charWidth() {
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(50);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
    $body.append(probe);
    const w = probe.getBoundingClientRect().width / 50;
    probe.remove();
    return w;
  }

  function fitWidth() {
    // Fit the chord and lyric lines to the viewport so a song never needs
    // sideways dragging while you play. Only ever shrink from the chosen size,
    // and never past MIN_FIT_FONT.
    $body.style.fontSize = fontSize + 'px';
    if (!fitTarget) return;
    const cs = getComputedStyle($body);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const avail = $body.clientWidth - padX;
    const needed = fitTarget * charWidth();
    if (avail > 0 && needed > avail) {
      $body.style.fontSize =
        Math.max(MIN_FIT_FONT, (fontSize * (avail - 1)) / needed) + 'px';
    }
  }

  function computeEndLimit() {
    const cs = getComputedStyle($body);
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const textBottom = $body.getBoundingClientRect().bottom + window.scrollY - padBottom;
    const dockH = $dock.getBoundingClientRect().height + 24; // dock plus its gap
    const docMax = document.documentElement.scrollHeight - window.innerHeight;
    endLimit = Math.max(0, Math.min(textBottom + dockH - window.innerHeight, docMax));
  }

  function render() {
    $body.innerHTML = renderBody(bodyText, transpose);
    syncMeta();
  }

  // Title subtitle plus whatever readouts the tools sheet currently has open.
  // The transpose amount lives in the subtitle now that it is off the dock: it
  // has to stay visible somewhere, or a song silently reads in the wrong key.
  function syncMeta() {
    const bits = [song.artist];
    if (song.capo) bits.push(`capo ${song.capo}`);
    const tuning = tuningLabel(song.tuning);
    if (tuning) bits.push(tuning);
    // Which version you are reading only matters when there is more than one.
    if (versions.length > 1) bits.push(kindLabel(song.kind));
    if (transpose) bits.push(`transpose ${transpose > 0 ? '+' : ''}${transpose}`);
    $sub.textContent = bits.filter(Boolean).join(' · ');

    $lvl.textContent = String(level);
    const set = (elId, text) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = text;
    };
    set('tr-val', transpose > 0 ? '+' + transpose : String(transpose));
    set('fs-val', String(fontSize));
    set('sp-val', '· level ' + level);
    const slider = document.getElementById('sheet-speed');
    if (slider && slider !== document.activeElement) slider.value = String(level);
  }

  function relayout() {
    fitWidth();
    computeEndLimit();
    updateProgress();
  }

  render();
  relayout();
  window.addEventListener('resize', relayout);
  enableChordPopovers($body); // tap a chord to see its fingering

  // Sibling versions of this song. Filtered from the whole library list rather
  // than fetched with ?q=: the plain /songs url is the one the service worker
  // caches, so switching version keeps working with no signal.
  api('/songs')
    .then((rows) => {
      const mine = rows.filter((r) => groupKey(r) === groupKey(song));
      if (mine.length > 1) {
        versions = mine;
        syncMeta();
      }
    })
    .catch(() => { /* the selector simply stays hidden */ });

  document.getElementById('back').onclick = () => (location.hash = backHash);
  if (inSetlist) {
    const goTo = (i) => { if (i >= 0 && i < setlist.ids.length) location.hash = '#/song/' + setlist.ids[i]; };
    document.getElementById('prev').onclick = () => goTo(setIdx - 1);
    document.getElementById('next').onclick = () => goTo(setIdx + 1);
    if ($next) $next.onclick = () => goTo(setIdx + 1);
  }

  function setTranspose(n) {
    transpose = Math.min(11, Math.max(-11, n));
    dirty = true;
    render();
    relayout();
  }

  function setFont(n) {
    fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, n));
    localStorage.setItem('opentabs.fontSize', String(fontSize));
    relayout();
    syncMeta();
  }

  function setLevel(n) {
    level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(n) || MIN_LEVEL));
    speed = levelToSpeed(level);
    dirty = true;
    syncMeta();
  }

  document.getElementById('spd-down').onclick = () => setLevel(level - 1);
  document.getElementById('spd-up').onclick = () => setLevel(level + 1);

  // Everything that is not "play" or "nudge the speed" lives in a sheet: on a
  // phone the dock has to stay out of the way of the song.
  function openTools() {
    const el = h(`
      <div class="tools">
        ${versions.length > 1 ? `
        <div class="tool-row">
          <span class="tool-label">Version</span>
          <button class="btn" id="ver-btn">${escapeHtml(kindLabel(song.kind))} ▾</button>
        </div>` : ''}
        <div class="tool-row">
          <span class="tool-label">Transpose</span>
          <div class="pill">
            <button id="tr-down" aria-label="Transpose down">♭</button>
            <span id="tr-val"></span>
            <button id="tr-up" aria-label="Transpose up">♯</button>
          </div>
        </div>
        <div class="tool-row">
          <span class="tool-label">Font size</span>
          <div class="pill">
            <button id="fs-down" aria-label="Smaller text">A-</button>
            <span id="fs-val"></span>
            <button id="fs-up" aria-label="Bigger text">A+</button>
          </div>
        </div>
        <div class="tool-row stacked">
          <span class="tool-label">Autoscroll speed <span class="count" id="sp-val"></span></span>
          <input type="range" id="sheet-speed" min="${MIN_LEVEL}" max="${MAX_LEVEL}"
                 step="1" value="${level}" aria-label="Autoscroll speed">
        </div>
        <div class="tool-actions">
          <button class="btn" id="t-collection">Add to collection</button>
          <button class="btn" id="t-edit">Edit song</button>
        </div>
      </div>`);
    const sheet = openSheet(el);
    const $ver = el.querySelector('#ver-btn');
    if ($ver) {
      $ver.onclick = () => {
        sheet.close();
        versionPickerDialog(versions, { currentId: song.id });
      };
    }
    el.querySelector('#tr-down').onclick = () => setTranspose(transpose - 1);
    el.querySelector('#tr-up').onclick = () => setTranspose(transpose + 1);
    el.querySelector('#fs-down').onclick = () => setFont(fontSize - 1);
    el.querySelector('#fs-up').onclick = () => setFont(fontSize + 1);
    el.querySelector('#sheet-speed').oninput = (e) => setLevel(Number(e.target.value));
    el.querySelector('#t-collection').onclick = () => { sheet.close(); addToCollectionDialog(song); };
    el.querySelector('#t-edit').onclick = () => { sheet.close(); location.hash = '#/edit/' + song.id; };
    syncMeta();
  }
  document.getElementById('tools').onclick = openTools;

  async function acquireWake() {
    if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      // The browser drops the lock whenever the page is hidden; forget it so
      // the next visibilitychange requests a fresh one.
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null; // wake lock is best-effort
    }
  }

  function releaseWake() {
    const lock = wakeLock;
    wakeLock = null;
    lock?.release?.().catch(() => {});
  }

  function keepAwake() {
    acquireWake();
    clearTimeout(wakeIdle);
    wakeIdle = setTimeout(() => { if (!playing) releaseWake(); }, WAKE_IDLE_MS);
  }

  // Fade the dock down while autoscroll runs, back up on any touch: it sits
  // over the song, so it should only be as present as it needs to be.
  function pokeDock() {
    $dock.classList.remove('dim');
    clearTimeout(dimT);
    if (playing) dimT = setTimeout(() => $dock.classList.add('dim'), DOCK_DIM_MS);
  }

  const onPoke = () => { pokeDock(); keepAwake(); };
  document.addEventListener('pointerdown', onPoke);

  let acc = 0, last = 0;
  function step(ts) {
    if (!playing) return;
    if (last) {
      // Clamp the frame delta: after backgrounding, ts-last spans the whole
      // hidden period and would otherwise cause one giant scroll jump.
      acc += Math.min((ts - last) / 1000, 0.1) * speed;
      if (acc >= 1) {
        const px = Math.floor(acc);
        acc -= px;
        // Stop within a pixel of the last line: scrollY is capped (and rounded
        // by devicePixelRatio) at the document bottom, so it may never reach a
        // fractional endLimit exactly. A 1px tolerance avoids scrolling forever.
        const remaining = endLimit - window.scrollY;
        if (remaining <= 1) { toggle(false); return; } // reached the last line
        window.scrollBy(0, Math.min(px, remaining));
      }
    }
    last = ts;
    raf = requestAnimationFrame(step);
  }

  function toggle(on = !playing) {
    playing = on;
    $play.textContent = playing ? '⏸' : '▶';
    $play.classList.toggle('playing', playing);
    $play.setAttribute('aria-label', playing ? 'Pause autoscroll' : 'Start autoscroll');
    last = 0; acc = 0;
    if (playing) raf = requestAnimationFrame(step);
    else if (raf) cancelAnimationFrame(raf);
    // The screen is kept awake either way: stopping at the last line is not a
    // reason to let the phone lock on you mid-song.
    keepAwake();
    pokeDock();
  }
  $play.onclick = () => toggle();

  // Double-tap the tab body to toggle autoscroll: much easier than the play
  // button with a guitar in hand. Manual detection, since dblclick is
  // unreliable in the iOS standalone PWA; scroll gestures and taps on chords
  // (which open the fingering popover) don't count.
  let tapT = 0, tapX = 0, tapY = 0, tapMoved = false, downX = 0, downY = 0;
  $body.addEventListener('pointerdown', (e) => {
    tapMoved = false;
    downX = e.clientX; downY = e.clientY;
  });
  $body.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 12) tapMoved = true;
  });
  $body.addEventListener('pointerup', (e) => {
    if (tapMoved || e.target.closest('.chord')) { tapT = 0; return; }
    const isDouble = e.timeStamp - tapT < 350 &&
      Math.abs(e.clientX - tapX) < 30 && Math.abs(e.clientY - tapY) < 30;
    if (isDouble) { tapT = 0; toggle(); return; }
    tapT = e.timeStamp; tapX = e.clientX; tapY = e.clientY;
  });

  // Space toggles autoscroll (handy on the laptop); ignore it while typing.
  function onKey(e) {
    if (e.key !== ' ' && e.code !== 'Space') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    toggle();
  }
  document.addEventListener('keydown', onKey);

  // Flush settings even when the PWA is swiped away or the page discarded:
  // teardown never runs then, but pagehide does, and sendBeacon survives it.
  function flushSettings() {
    if (!dirty) return;
    dirty = false;
    const url = `/api/songs/${id}/played`;
    const payload = JSON.stringify({ scroll_speed: speed, transpose });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      api(`/songs/${id}/played`, {
        method: 'POST',
        body: { scroll_speed: speed, transpose },
      }).catch(() => {});
    }
  }

  const onVis = () => {
    if (document.visibilityState === 'visible') keepAwake();
    if (document.visibilityState === 'hidden') {
      last = 0; // don't count hidden time toward autoscroll
      flushSettings();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', flushSettings);

  keepAwake();

  // Persist played_at; fire-and-forget.
  api(`/songs/${id}/played`, { method: 'POST', body: {} }).catch(() => {});

  return () => {
    hideChordPopover();
    window.removeEventListener('scroll', updateProgress);
    window.removeEventListener('resize', relayout);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPoke);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', flushSettings);
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(wakeIdle);
    clearTimeout(dimT);
    releaseWake();
    flushSettings();
  };
}
