import { $app, api, h, escapeHtml } from '../app.js';
import { renderBody } from '../chords.js';

export async function readerView([id]) {
  let song;
  try {
    song = await api('/songs/' + id);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    $app.innerHTML = `<div class="empty error">${escapeHtml(err.message)}</div>`;
    return;
  }

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
      <button class="btn icon" id="edit" title="Edit">✏️</button>
    </header>
    <pre class="tabbody" id="body"></pre>
    <div class="reader-controls">
      <button class="btn primary icon" id="play" title="Autoscroll">▶</button>
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

  function render() {
    $body.style.fontSize = fontSize + 'px';
    $body.innerHTML = renderBody(song.body || '', transpose);
    $trVal.textContent = transpose > 0 ? '+' + transpose : String(transpose);
  }
  render();

  document.getElementById('back').onclick = () => (location.hash = '#/');
  document.getElementById('edit').onclick = () => (location.hash = '#/edit/' + song.id);
  document.getElementById('tr-up').onclick = () => { transpose = Math.min(11, transpose + 1); dirty = true; render(); };
  document.getElementById('tr-down').onclick = () => { transpose = Math.max(-11, transpose - 1); dirty = true; render(); };
  document.getElementById('fs-up').onclick = () => { fontSize = Math.min(24, fontSize + 1); save(); render(); };
  document.getElementById('fs-down').onclick = () => { fontSize = Math.max(9, fontSize - 1); save(); render(); };
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
      acc += ((ts - last) / 1000) * speed;
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
    last = 0; acc = 0;
    if (playing) raf = requestAnimationFrame(step);
    else if (raf) cancelAnimationFrame(raf);
    setWakeLock(playing);
  }
  $play.onclick = () => toggle();

  const onVis = () => {
    if (document.visibilityState === 'visible' && playing) setWakeLock(true);
  };
  document.addEventListener('visibilitychange', onVis);

  // Persist played_at + reader settings; fire-and-forget.
  api(`/songs/${id}/played`, { method: 'POST', body: {} }).catch(() => {});

  return () => {
    document.removeEventListener('visibilitychange', onVis);
    if (raf) cancelAnimationFrame(raf);
    setWakeLock(false);
    if (dirty) {
      api(`/songs/${id}/played`, {
        method: 'POST',
        body: { scroll_speed: speed, transpose },
      }).catch(() => {});
    }
  };
}
