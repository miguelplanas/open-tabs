import { $app, api, escapeHtml, h } from '../app.js';
import { icon } from '../icons.js';
import {
  renderBody, fitChars, pageStep, pageKeyDirection, uniqueChords, transposeChord,
} from '../chords.js';
import {
  addToCollectionDialog, openSheet, versionPickerDialog,
  groupKey, kindLabel, tuningLabel,
} from '../ui.js';
import {
  enableChordPopovers, hideChordPopover, showChordPopover, chordShape, diagramSvg,
} from '../chord-shapes.js';
import { swapSetlistSong } from '../setlist.js';
import { signed, bracket, transposeLabel } from '../reader-labels.js';
import { speedForDuration, formatRemaining, formatDuration, parseDuration } from '../autoscroll.js';

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

// Seconds of countdown between pressing play and the first scroll, to get the
// phone down and the guitar up.
const COUNTDOWN_S = 3;

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
  // 'auto' wraps only the songs that would otherwise be unreadable; 'off'
  // always keeps the original monospace layout, shrinking as before.
  let reflowPref = localStorage.getItem('opentabs.reflow') === 'off' ? 'off' : 'auto';
  let reflowing = false;
  // Characters that fit on one line at the current font: long staves are cut
  // into pieces this wide (chords.js, wrapStave). Infinity until measured.
  let staveCols = Infinity;
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
      <button class="btn quiet icon" id="back" title="Back" aria-label="Back">${icon('chevron-left')}</button>
      <h1>${escapeHtml(song.title)}
        <span class="sub" id="sub"></span>
      </h1>
      <button class="btn quiet icon" id="tools" title="Song tools" aria-label="Song tools" aria-haspopup="dialog">${icon('ellipsis')}</button>
    </header>
    ${inSetlist ? `
    <div class="setlist-bar">
      <button class="btn icon" id="prev" title="Previous" aria-label="Previous song" ${setIdx === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
      <span class="setlist-info">${escapeHtml(setlist.name)} <span class="count">${setIdx + 1}/${setlist.ids.length}</span></span>
      <button class="btn icon" id="next" title="Next" aria-label="Next song" ${setIdx === setlist.ids.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button>
    </div>` : ''}
    <section class="song-head" id="head" aria-label="About this song">
      <div class="song-facts">
        <span class="tech" id="facts"></span>
        <button type="button" class="btn quiet strip-toggle" id="strip-toggle" aria-controls="strip"></button>
      </div>
      <ul class="chord-strip" id="strip" aria-label="Chords in this song"></ul>
    </section>
    <pre class="tabbody" id="body"></pre>
    <div class="songend strings"></div>
    ${inSetlist && setIdx < setlist.ids.length - 1 ? `
    <button class="btn primary next-song" id="next-song" hidden>
      Next: ${escapeHtml(setlist.titles?.[setIdx + 1] || 'next song')} ${icon('chevron-right')}
    </button>` : ''}
    <div class="reader-dock" id="dock">
      <div class="dock-speed">
        <button id="spd-down" aria-label="Scroll slower">${icon('minus')}</button>
        <span class="dock-level" id="lvl" title="Autoscroll speed" aria-live="polite"></span>
        <button id="spd-up" aria-label="Scroll faster">${icon('plus')}</button>
      </div>
      <span class="dock-remain tech" id="remain" hidden aria-label="Time remaining"></span>
      <button class="btn primary icon play" id="play" title="Autoscroll" aria-label="Start autoscroll">${icon('play', { cls: 'fill' })}</button>
    </div>`;

  const $body = document.getElementById('body');
  const $play = document.getElementById('play');
  const $dock = document.getElementById('dock');
  const $lvl = document.getElementById('lvl');
  const $remain = document.getElementById('remain');
  const $sub = document.getElementById('sub');
  const $head = document.getElementById('head');
  const $strip = document.getElementById('strip');
  const $stripToggle = document.getElementById('strip-toggle');

  // Song header: capo and tuning, then every chord the song uses in the order
  // it first plays them, as small diagrams to warm up on before starting. The
  // diagrams can fold down to just the names; that choice is remembered.
  const songChords = uniqueChords(bodyText);
  const facts = [];
  if (song.capo) facts.push(`[capo ${song.capo}]`);
  if (tuningLabel(song.tuning)) facts.push(`[${tuningLabel(song.tuning)}]`);
  document.getElementById('facts').textContent = facts.join(' ');
  $head.hidden = facts.length === 0 && songChords.length === 0;
  $strip.hidden = $stripToggle.hidden = songChords.length === 0;
  let stripOpen = true;
  try { stripOpen = localStorage.getItem('opentabs.chordStrip') !== 'names'; } catch { /* default */ }

  function renderHead() {
    if (!songChords.length) return;
    $stripToggle.textContent = stripOpen ? 'Hide diagrams' : 'Show diagrams';
    $stripToggle.setAttribute('aria-expanded', String(stripOpen));
    $strip.innerHTML = songChords.map((c) => {
      const name = transposeChord(c, transpose);
      const frets = stripOpen ? chordShape(name) : null;
      return `<li><button type="button" class="strip-chord" aria-label="${escapeHtml(name)}, show fingering">` +
        `<span class="chord">${escapeHtml(name)}</span>${frets ? diagramSvg(frets) : ''}</button></li>`;
    }).join('');
  }
  $stripToggle.onclick = () => {
    stripOpen = !stripOpen;
    try { localStorage.setItem('opentabs.chordStrip', stripOpen ? 'diagrams' : 'names'); } catch { /* not remembered */ }
    renderHead();
    computeEndLimit();
    updateProgress();
  };
  // Tapping a chord in the strip opens the same, larger fingering popover.
  $strip.addEventListener('click', (e) => {
    const b = e.target.closest('.strip-chord');
    if (b) showChordPopover(b.querySelector('.chord'));
  });

  // In a setlist, surface "Next: …" once the reader hits the end of the song,
  // so advancing never requires scrolling back to the top bar.
  const $next = document.getElementById('next-song');

  // The scroll position at which the song is "done": the last line has reached
  // just above the dock. Autoscroll and the "Next" button both go by this rather
  // than at the document bottom, so no blank tail scrolls past.
  let endLimit = Infinity;

  function updateProgress() {
    const max = Number.isFinite(endLimit) && endLimit > 0
      ? endLimit
      : Math.max(0, document.body.scrollHeight - window.innerHeight);
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

  // The font size a plain (non-reflowed) render would need for this song to fit
  // the viewport. Returns the chosen size when no shrinking is required.
  function fittedFont() {
    $body.style.fontSize = fontSize + 'px';
    if (!fitTarget) return fontSize;
    const cs = getComputedStyle($body);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const avail = $body.clientWidth - padX;
    const needed = fitTarget * charWidth();
    if (avail <= 0 || needed <= avail) return fontSize;
    return (fontSize * (avail - 1)) / needed;
  }

  // Reflow is a rescue, not a style: a song that fits at a readable size keeps
  // its original monospace alignment, which is what a guitarist recognizes.
  // Only when fitting would push the text below MIN_FIT_FONT is the chord and
  // lyric pairing worth the extra vertical length it costs.
  function wantsReflow() {
    if (reflowPref === 'off') return false;
    return fittedFont() < MIN_FIT_FONT;
  }

  function fitWidth() {
    // A reflowed song fits by construction, so it keeps the chosen size.
    if (reflowing) { $body.style.fontSize = fontSize + 'px'; return; }
    $body.style.fontSize = Math.max(MIN_FIT_FONT, fittedFont()) + 'px';
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
    $body.innerHTML = renderBody(bodyText, transpose, {
      reflow: reflowing,
      // "Wrap long lines: Off" keeps every stave whole, scrolling sideways.
      staveCols: reflowPref === 'off' ? Infinity : staveCols,
    });
    renderHead();
    syncMeta();
  }

  // Title subtitle plus whatever readouts the tools sheet currently has open.
  // The transpose amount lives in the subtitle now that it is off the dock: it
  // has to stay visible somewhere, or a song silently reads in the wrong key.
  function syncMeta() {
    // Capo and tuning live in the song header above the body.
    const bits = [song.artist];
    // Which version you are reading only matters when there is more than one.
    if (versions.length > 1) bits.push(kindLabel(song.kind));
    if (transpose) bits.push(`transpose ${signed(transpose)}`);
    $sub.textContent = bits.filter(Boolean).join(', ');

    $lvl.textContent = String(level);
    const set = (elId, text) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = text;
    };
    set('tr-val', transposeLabel(transpose));
    set('fs-val', bracket(fontSize));
    set('sp-val', bracket(level));
    const slider = document.getElementById('sheet-speed');
    if (slider && slider !== document.activeElement) slider.value = String(level);
  }

  function relayout() {
    const want = wantsReflow();
    if (want !== reflowing) {
      reflowing = want;
      render(); // the two layouts are different HTML, not just different CSS
    }
    fitWidth();
    // The fitted font decides how many characters a stave piece can hold.
    const cs = getComputedStyle($body);
    const avail = $body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const cols = Math.floor(avail / charWidth());
    if (cols > 0 && cols !== staveCols) {
      staveCols = cols;
      render();
    }
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
  const goTo = (i) => {
    if (inSetlist && i >= 0 && i < setlist.ids.length) location.hash = '#/song/' + setlist.ids[i];
  };
  if (inSetlist) {
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

  // Time left at the current speed, in the dock while playing. Only touches
  // the DOM when the text changes (about once a second).
  function updateRemaining() {
    const text = playing && Number.isFinite(endLimit)
      ? formatRemaining(endLimit - window.scrollY, speed) : '';
    $remain.hidden = !text;
    if ($remain.textContent !== text) $remain.textContent = text;
  }

  // Song length at the current speed, for the tools sheet: the distance from
  // the top to the end limit, over the speed.
  const totalSeconds = () => (Number.isFinite(endLimit) && speed > 0 ? endLimit / speed : 0);

  // Set the speed from "the song should last mm:ss". The stored scroll_speed
  // is already px/s (a real number), so nothing changes server-side.
  function setDuration(seconds) {
    const px = speedForDuration(endLimit, seconds);
    if (px === null) return false;
    speed = px;
    level = speedToLevel(speed);
    dirty = true;
    syncMeta();
    updateRemaining();
    return true;
  }

  function setLevel(n) {
    level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(n) || MIN_LEVEL));
    speed = levelToSpeed(level);
    dirty = true;
    syncMeta();
    updateRemaining();
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
          <button class="btn" id="ver-btn">${escapeHtml(kindLabel(song.kind))} ${icon('chevron-down')}</button>
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
          <span class="tool-label" id="rf-label">Wrap long lines</span>
          <div class="segments tool-seg" id="rf-seg" role="radiogroup" aria-labelledby="rf-label">
            <button type="button" class="segment" role="radio" data-rf="auto">Auto</button>
            <button type="button" class="segment" role="radio" data-rf="off">Off</button>
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
          <span class="tool-label">Autoscroll speed <span class="tech muted" id="sp-val"></span></span>
          <input type="range" id="sheet-speed" min="${MIN_LEVEL}" max="${MAX_LEVEL}"
                 step="1" value="${level}" aria-label="Autoscroll speed">
        </div>
        <div class="tool-row">
          <span class="tool-label">Theme</span>
          <button type="button" class="btn quiet theme-toggle" data-theme-toggle aria-label="Switch light or dark theme"></button>
        </div>
        <div class="tool-row">
          <label class="tool-label" for="sheet-dur">Song length at this speed</label>
          <input class="tech dur-input" id="sheet-dur" inputmode="numeric" autocomplete="off"
                 placeholder="m:ss" aria-describedby="dur-hint">
        </div>
        <p class="small muted" id="dur-hint">Type a length such as 3:30 and the speed is set to match.</p>
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
        versionPickerDialog(versions, {
          currentId: song.id,
          // Keep playing through the setlist with the version you picked.
          onPick: (v) => {
            if (!inSetlist) return;
            try {
              sessionStorage.setItem('opentabs.setlist', JSON.stringify(swapSetlistSong(setlist, song.id, v.id)));
            } catch { /* the setlist is lost, as before */ }
          },
        });
      };
    }
    el.querySelector('#tr-down').onclick = () => setTranspose(transpose - 1);
    el.querySelector('#tr-up').onclick = () => setTranspose(transpose + 1);
    const $rf = el.querySelector('#rf-seg');
    const syncRf = () => {
      for (const b of $rf.children) {
        const on = b.dataset.rf === reflowPref;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
    syncRf();
    $rf.onclick = (e) => {
      const b = e.target.closest('[data-rf]');
      if (!b || b.dataset.rf === reflowPref) return;
      reflowPref = b.dataset.rf;
      localStorage.setItem('opentabs.reflow', reflowPref);
      syncRf();
      render();
      relayout();
    };
    el.querySelector('#fs-down').onclick = () => setFont(fontSize - 1);
    el.querySelector('#fs-up').onclick = () => setFont(fontSize + 1);
    el.querySelector('#sheet-speed').oninput = (e) => {
      setLevel(Number(e.target.value));
      $dur.value = formatDuration(totalSeconds());
    };
    const $dur = el.querySelector('#sheet-dur');
    $dur.value = formatDuration(totalSeconds());
    $dur.onchange = () => {
      const secs = parseDuration($dur.value);
      if (secs === null || !setDuration(secs)) {
        $dur.setAttribute('aria-invalid', 'true');
        return;
      }
      $dur.removeAttribute('aria-invalid');
      // The speed may have been clamped: show the length it really gives.
      $dur.value = formatDuration(totalSeconds());
      const slider = el.querySelector('#sheet-speed');
      slider.value = String(level);
    };
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
    updateRemaining();
    raf = requestAnimationFrame(step);
  }

  // Pressing play starts a short countdown shown on the button; pressing
  // again (or Space, or a double tap) while it runs cancels it. No animation:
  // the number just changes once a second, so reduced motion needs nothing.
  let counting = null;
  function showPlayButton() {
    $play.innerHTML = icon(playing ? 'pause' : 'play', { cls: 'fill' });
    $play.classList.remove('counting');
    $play.setAttribute('aria-label', playing ? 'Pause autoscroll' : 'Start autoscroll');
  }
  function cancelCountdown() {
    clearInterval(counting);
    counting = null;
    showPlayButton();
  }
  function startCountdown() {
    let n = COUNTDOWN_S;
    const paint = () => {
      $play.innerHTML = `<span class="count-num">${n}</span>`;
      $play.classList.add('counting');
      $play.setAttribute('aria-label', `Starting in ${n}, tap to cancel`);
    };
    paint();
    counting = setInterval(() => {
      n -= 1;
      if (n > 0) { paint(); return; }
      cancelCountdown();
      toggle(true, true);
    }, 1000);
    keepAwake();
    pokeDock();
  }

  function toggle(on = !playing, now = false) {
    if (counting) { cancelCountdown(); return; }
    if (on && !playing && !now) { startCountdown(); return; }
    playing = on;
    showPlayButton();
    $play.classList.toggle('playing', playing);
    updateRemaining();
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

  // One page turn (keyboard or Bluetooth pedal). At the ends of the song, in a
  // setlist, it moves to the next or previous song; outside one it does nothing.
  // While autoscroll runs it keeps running from the new position: the turn is
  // a correction ("I'm further on"), not a request to stop. The jump is then
  // instant, because a smooth scroll would fight the autoscroll's own scrollBy.
  function turnPage(dir) {
    const y = window.scrollY;
    if (dir > 0 && y >= endLimit - 1) return goTo(setIdx + 1);
    if (dir < 0 && y <= 1) return goTo(setIdx - 1);
    const topbarH = document.querySelector('.topbar')?.getBoundingClientRect().height || 0;
    const dockH = $dock.getBoundingClientRect().height + 24; // dock plus its gap
    const lineH = parseFloat(getComputedStyle($body).lineHeight) || 20;
    const px = pageStep(window.innerHeight, topbarH, dockH, lineH);
    const top = dir > 0 ? Math.min(y + px, endLimit) : Math.max(0, y - px);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: playing || reduce ? 'auto' : 'smooth' });
    acc = 0;
    keepAwake();
  }

  // Space toggles autoscroll (handy on the laptop); ignore it while typing.
  // Page keys turn the page, except while typing, with a sheet or dialog open,
  // or with a modifier held.
  function onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      toggle();
      return;
    }
    const dir = pageKeyDirection(e);
    if (!dir || t?.tagName === 'SELECT' || document.querySelector('[aria-modal="true"]')) return;
    // Enter on a focused button or link still presses it (keyboard users).
    // iOS does not focus buttons on tap, so a pedal's Enter is not swallowed.
    if (e.key === 'Enter' && t?.closest?.('button, a')) return;
    e.preventDefault();
    turnPage(dir);
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
    clearInterval(counting);
    clearTimeout(dimT);
    releaseWake();
    flushSettings();
  };
}
