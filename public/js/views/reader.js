import { $app, api, escapeHtml } from '../app.js';
import { renderBody } from '../chords.js';
import { addToCollectionDialog } from '../ui.js';
import { enableChordPopovers, hideChordPopover } from '../chord-shapes.js';

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
  let speed = song.scroll_speed || 20; // pixels per second
  let fontSize = Number(localStorage.getItem('opentabs.fontSize')) || 14;
  let playing = false;
  let wakeLock = null;
  let raf = null;
  let dirty = false;

  $app.innerHTML = `
    <header class="topbar">
      <button class="btn icon" id="back" title="Back">←</button>
      <h1>${escapeHtml(song.title)}
        <span class="sub">${escapeHtml(song.artist)}${
          song.capo ? ` · capo ${song.capo}` : ''}${
          song.tuning && song.tuning.toLowerCase() !== 'standard' ? ` · ${escapeHtml(song.tuning)}` : ''}</span>
      </h1>
      <button class="btn icon" id="add-col" title="Add to collection">📁</button>
      <button class="btn icon" id="edit" title="Edit">✏️</button>
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
    <div class="reader-controls">
      <button class="btn primary icon play" id="play" title="Autoscroll">▶</button>
      <input type="range" id="speed" min="4" max="120" step="1" value="${speed}" title="Scroll speed">
      <div class="pill" title="Transpose">
        <button id="tr-down">♭</button><span id="tr-val"></span><button id="tr-up">♯</button>
      </div>
      <div class="pill" title="Font size">
        <button id="fs-down">A-</button><button id="fs-up">A+</button>
      </div>
    </div>`;

  const $body = document.getElementById('body');
  const $play = document.getElementById('play');
  const $trVal = document.getElementById('tr-val');
  const $progress = document.getElementById('progress');

  // In a setlist, surface "Next: …" once the reader hits the end of the song,
  // so advancing never requires scrolling back to the top bar.
  const $next = document.getElementById('next-song');

  function updateProgress() {
    const max = document.body.scrollHeight - window.innerHeight;
    $progress.style.top = (max > 0 ? (100 * window.scrollY) / max : 0) + '%';
    if ($next) $next.hidden = window.scrollY < max - 40;
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  function applyFontSize() {
    $body.style.fontSize = fontSize + 'px';
  }
  function render() {
    $body.innerHTML = renderBody(song.body || '', transpose);
    $trVal.textContent = transpose > 0 ? '+' + transpose : String(transpose);
  }
  applyFontSize();
  render();
  updateProgress(); // the first call ran before the body had content
  enableChordPopovers($body); // tap a chord to see its fingering

  document.getElementById('back').onclick = () => (location.hash = backHash);
  document.getElementById('edit').onclick = () => (location.hash = '#/edit/' + song.id);
  document.getElementById('add-col').onclick = () => addToCollectionDialog(song);
  if (inSetlist) {
    const goTo = (i) => { if (i >= 0 && i < setlist.ids.length) location.hash = '#/song/' + setlist.ids[i]; };
    document.getElementById('prev').onclick = () => goTo(setIdx - 1);
    document.getElementById('next').onclick = () => goTo(setIdx + 1);
    if ($next) $next.onclick = () => goTo(setIdx + 1);
  }
  document.getElementById('tr-up').onclick = () => { transpose = Math.min(11, transpose + 1); dirty = true; render(); };
  document.getElementById('tr-down').onclick = () => { transpose = Math.max(-11, transpose - 1); dirty = true; render(); };
  document.getElementById('fs-up').onclick = () => { fontSize = Math.min(24, fontSize + 1); save(); applyFontSize(); };
  document.getElementById('fs-down').onclick = () => { fontSize = Math.max(9, fontSize - 1); save(); applyFontSize(); };
  document.getElementById('speed').oninput = (e) => { speed = Number(e.target.value); dirty = true; };
  function save() { localStorage.setItem('opentabs.fontSize', String(fontSize)); }

  async function setWakeLock(on) {
    try {
      if (on && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch { /* wake lock is best-effort */ }
  }

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
        window.scrollBy(0, px);
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
          toggle(false); // reached the end
          return;
        }
      }
    }
    last = ts;
    raf = requestAnimationFrame(step);
  }

  function toggle(on = !playing) {
    playing = on;
    $play.textContent = playing ? '⏸' : '▶';
    $play.classList.toggle('playing', playing);
    last = 0; acc = 0;
    if (playing) raf = requestAnimationFrame(step);
    else if (raf) cancelAnimationFrame(raf);
    setWakeLock(playing);
  }
  $play.onclick = () => toggle();

  // Double-tap the tab body to toggle autoscroll: much easier than the play
  // button with a guitar in hand. Manual detection, since dblclick is
  // unreliable in the iOS standalone PWA; scroll gestures and taps on chords
  // (reserved for future use) don't count.
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
    if (document.visibilityState === 'visible' && playing) setWakeLock(true);
    if (document.visibilityState === 'hidden') {
      last = 0; // don't count hidden time toward autoscroll
      flushSettings();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', flushSettings);

  // Persist played_at; fire-and-forget.
  api(`/songs/${id}/played`, { method: 'POST', body: {} }).catch(() => {});

  return () => {
    hideChordPopover();
    window.removeEventListener('scroll', updateProgress);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', flushSettings);
    if (raf) cancelAnimationFrame(raf);
    setWakeLock(false);
    flushSettings();
  };
}
