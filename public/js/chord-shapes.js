// Guitar chord diagrams: a small set of open template shapes per chord
// quality, shifted up the neck for roots without an open form (the classic
// E-shape / A-shape barre logic). Rendered as inline SVG in a popover.

import { parseChord, escapeHtml, NOTE_INDEX } from './chords.js';


// Template shapes: for each quality, open voicings keyed by their root note.
// Strings low E → high e; 'x' muted, 0 open. A chord is built from the
// template whose root needs the smallest shift up the neck.
export const TEMPLATES = {
  '': [
    ['E', [0, 2, 2, 1, 0, 0]], ['A', ['x', 0, 2, 2, 2, 0]],
    ['C', ['x', 3, 2, 0, 1, 0]], ['G', [3, 2, 0, 0, 0, 3]], ['D', ['x', 'x', 0, 2, 3, 2]],
  ],
  m: [
    ['E', [0, 2, 2, 0, 0, 0]], ['A', ['x', 0, 2, 2, 1, 0]], ['D', ['x', 'x', 0, 2, 3, 1]],
  ],
  7: [
    ['E', [0, 2, 0, 1, 0, 0]], ['A', ['x', 0, 2, 0, 2, 0]], ['C', ['x', 3, 2, 3, 1, 0]],
    ['G', [3, 2, 0, 0, 0, 1]], ['D', ['x', 'x', 0, 2, 1, 2]], ['B', ['x', 2, 1, 2, 0, 2]],
  ],
  m7: [
    ['E', [0, 2, 0, 0, 0, 0]], ['A', ['x', 0, 2, 0, 1, 0]], ['D', ['x', 'x', 0, 2, 1, 1]],
  ],
  maj7: [
    ['E', [0, 2, 1, 1, 0, 0]], ['A', ['x', 0, 2, 1, 2, 0]], ['C', ['x', 3, 2, 0, 0, 0]],
    ['D', ['x', 'x', 0, 2, 2, 2]], ['F', ['x', 'x', 3, 2, 1, 0]],
  ],
  sus2: [
    ['A', ['x', 0, 2, 2, 0, 0]], ['D', ['x', 'x', 0, 2, 3, 0]],
  ],
  sus4: [
    ['E', [0, 2, 2, 2, 0, 0]], ['A', ['x', 0, 2, 2, 3, 0]], ['D', ['x', 'x', 0, 2, 3, 3]],
  ],
  '7sus4': [
    ['E', [0, 2, 0, 2, 0, 0]], ['A', ['x', 0, 2, 0, 3, 0]], ['D', ['x', 'x', 0, 2, 1, 3]],
  ],
  6: [
    ['C', ['x', 3, 2, 2, 1, 0]], ['A', ['x', 0, 2, 2, 2, 2]],
    ['E', [0, 2, 2, 1, 2, 0]], ['D', ['x', 'x', 0, 2, 0, 2]],
  ],
  m6: [
    ['A', ['x', 0, 2, 2, 1, 2]], ['E', [0, 2, 2, 0, 2, 0]], ['D', ['x', 'x', 0, 2, 0, 1]],
  ],
  9: [
    ['E', [0, 2, 0, 1, 0, 2]], ['A', ['x', 0, 2, 4, 2, 3]],
    ['C', ['x', 3, 2, 3, 3, 3]], ['D', ['x', 5, 4, 5, 5, 5]],
  ],
  13: [
    ['E', [0, 2, 0, 1, 2, 0]], ['A', ['x', 0, 2, 0, 2, 2]], ['G', [3, 'x', 3, 4, 5, 0]],
  ],
  maj9: [
    ['E', [0, 2, 1, 1, 0, 2]], ['A', ['x', 0, 2, 4, 2, 4]], ['C', ['x', 3, 0, 0, 0, 0]],
  ],
  mmaj7: [
    ['E', [0, 2, 1, 0, 0, 0]], ['A', ['x', 0, 2, 1, 1, 0]], ['D', ['x', 'x', 0, 2, 2, 1]],
  ],
  m9: [
    ['E', [0, 2, 0, 0, 0, 2]], ['A', ['x', 0, 5, 5, 0, 0]],
  ],
  madd9: [
    ['E', [0, 2, 4, 0, 0, 0]], ['A', ['x', 0, 2, 4, 1, 0]],
    // Movable on the top four strings: Fm(add9) is xx3113.
    ['E', ['x', 'x', 2, 0, 0, 2]],
  ],
  add11: [
    ['C', ['x', 3, 2, 0, 1, 1]], ['E', [0, 0, 2, 1, 0, 0]], ['A', ['x', 0, 0, 2, 2, 0]],
  ],
  add9: [
    ['C', ['x', 3, 2, 0, 3, 0]], ['G', [3, 2, 0, 2, 0, 3]],
    ['D', ['x', 5, 4, 2, 3, 0]], ['A', ['x', 0, 2, 4, 2, 0]],
  ],
  dim: [ // voiced as dim7
    ['A', ['x', 0, 1, 2, 1, 2]], ['E', [0, 1, 2, 0, 2, 0]], ['D', ['x', 'x', 0, 1, 0, 1]],
  ],
  m7b5: [
    ['A', ['x', 0, 1, 0, 1, 'x']], ['D', ['x', 'x', 0, 1, 1, 1]],
  ],
  aug: [
    ['D', ['x', 'x', 0, 3, 3, 2]], ['A', ['x', 0, 3, 2, 2, 1]],
  ],
  5: [
    ['E', [0, 2, 2, 'x', 'x', 'x']], ['A', ['x', 0, 2, 2, 'x', 'x']], ['D', ['x', 'x', 0, 2, 3, 'x']],
  ],
};

// What a chord's quality says, read token by token (maj, m, dim, sus4, add9,
// 7, b5, #9...) into features. Spellings vary a lot between sites: Am(maj7),
// AmM7 and Am7M are the same chord, and CifraClub writes 7(4) for 7sus4 and
// (9) for add9. Reading features first and choosing a voicing after keeps
// every spelling on the same path, so a new spelling is a token here and a
// new voicing is a line in TEMPLATES.
const TOKEN_RE = /^(maj|min|dim|aug|sus|add|Δ|M|m|°|o|\+|[#b]?\d+)/;

function qualityFeatures(q) {
  const f = {
    minor: false, seventh: false, maj7: false, six: false, nine: false, eleven: false,
    thirteen: false, add9: false, add11: false, sus2: false, sus4: false,
    dim: false, aug: false, flat5: false, power: false, unknown: false,
  };
  const ext = (n) => {
    if (n === '7') f.seventh = true;
    else if (n === '9') f.nine = true;
    else if (n === '11') f.eleven = true;
    else if (n === '13') f.thirteen = true;
    else if (n === '6') f.six = true;
    else if (n === '69') { f.six = true; f.add9 = true; }
    else if (n === '5') f.power = true;
    else if (n === '2') f.sus2 = true;
    else if (n === '4') f.sus4 = true;
    else if (n === 'b5') f.flat5 = true;
    else if (n === '#5') f.aug = true;
    // b9, #9, #11, b13 color a dominant chord; the voicing stays a 7.
  };
  // Paren groups are extensions: 7(4), (9), 7(#11), m(maj7), 6(9).
  const groups = [];
  let s = q.replace(/\*+$/, '').replace(/\(([^)]*)\)/g, (_, g) => { groups.push(...g.split(/[,/]/)); return ''; });
  for (const g of groups) {
    const t = g.trim();
    if (/^(maj|M|Δ)7?$/.test(t)) f.maj7 = true;
    else if (/^add/.test(t)) ext(t.slice(3));
    else ext(t);
  }
  let first = true;
  while (s) {
    const m = s.match(TOKEN_RE);
    if (!m) { f.unknown = true; break; }
    const t = m[1];
    s = s.slice(t.length);
    if ((t === 'm' || t === 'min') && first) f.minor = true;
    else if (t === 'maj' || t === 'M' || t === 'Δ') {
      // maj7, M7, maj9: a major seventh. A bare "maj" or "M" just says major.
      const n = s.match(/^\d+/);
      if (n) { f.maj7 = true; s = s.slice(n[0].length); if (n[0] !== '7') ext(n[0]); }
      else if (!first && f.seventh) f.maj7 = true; // 7M, mM7 read the same
      else if (!first) f.maj7 = true;
    } else if (t === 'dim' || t === '°' || t === 'o') f.dim = true;
    else if (t === 'aug' || t === '+') f.aug = true;
    else if (t === 'sus') {
      const n = s.match(/^\d+/);
      if (n) s = s.slice(n[0].length);
      if (n && n[0] === '2') f.sus2 = true; else f.sus4 = true;
    } else if (t === 'add') {
      const n = s.match(/^\d+/);
      if (n) {
        s = s.slice(n[0].length);
        if (n[0] === '9' || n[0] === '2') f.add9 = true;
        else if (n[0] === '11' || n[0] === '4') f.add11 = true;
        else ext(n[0]);
      }
    } else if (t === 'm') f.minor = true;
    else {
      // 9, 11 and 13 imply the seventh under them; 6 and 2 do not.
      if (['9', '11', '13'].includes(t)) f.seventh = true;
      ext(t);
      if (t === '7' && s.startsWith('M')) { f.maj7 = true; s = s.slice(1); }
    }
    first = false;
  }
  if (f.maj7) f.seventh = true;
  // Extensions in parentheses without a seventh are added tones: C(9) = Cadd9.
  if (f.nine && !f.seventh) { f.add9 = true; f.nine = false; }
  if (f.eleven && !f.seventh) { f.add11 = true; f.eleven = false; }
  return f;
}

// The template quality to draw for a chord quality. Exported for the tests.
// What has no voicing of its own falls back to the nearest one that only
// leaves notes out (m11 draws as m9's m7, 7#9 as 7), never one that adds a
// note the chord does not have.
export function canonicalQuality(q) {
  const f = qualityFeatures(q);
  if (f.unknown) return null;
  if (f.power && !f.minor && !f.seventh && !f.six && !f.sus2 && !f.sus4) return '5';
  if (f.dim || (f.minor && f.flat5)) return f.minor || (f.seventh && !f.dim) ? 'm7b5' : 'dim';
  if (f.aug) return 'aug';
  if (f.sus4) return f.seventh && !f.maj7 ? '7sus4' : 'sus4';
  if (f.sus2 && !f.minor) return 'sus2';
  if (f.minor) {
    if (f.maj7) return 'mmaj7';
    if (f.seventh) return f.nine ? 'm9' : 'm7';
    if (f.six) return 'm6';
    if (f.add9 || f.sus2) return 'madd9';
    return 'm';
  }
  if (f.maj7) return f.nine ? 'maj9' : 'maj7';
  if (f.seventh) return f.thirteen ? '13' : f.nine ? '9' : '7';
  if (f.six) return '6';
  if (f.add9) return 'add9';
  if (f.add11) return 'add11';
  return '';
}

// Shapes that move up the neck the way guitarists actually play them: the E
// and A shapes as barre chords, and the D shape, which mutes the low strings
// and needs no barre. A C or G shape moved up is technically right but nobody
// plays G# as 4-3-1-1-1-4, so those only win when nothing else fits.
const MOVABLE = new Set(['E', 'A', 'D']);

// Frets between the lowest and highest fretted note: up to 3 is in reach.
const reach = (frets) => {
  const f = frets.filter((x) => x !== 'x' && x !== 0);
  return f.length ? Math.max(...f) - Math.min(...f) : 0;
};

// Open-string pitch classes, low E to high e.
const OPEN = [4, 9, 2, 7, 11, 4];

// Pick the open template if there is one, else the nearest movable shape, and
// move it up the neck; open strings under a shift become barre notes at the
// shift fret. A slash chord then gets its bass note (see withBass).
export function chordShape(token) {
  const parsed = parseChord(token);
  if (!parsed) return null;
  const templates = TEMPLATES[canonicalQuality(parsed.quality)];
  if (!templates || NOTE_INDEX[parsed.root] === undefined) return null;

  let best = null;
  for (const [base, frets] of templates) {
    const shift = (NOTE_INDEX[parsed.root] - NOTE_INDEX[base] + 12) % 12;
    const moved = frets.map((f) => (f === 'x' ? 'x' : f + shift));
    // A shape out of the hand's reach once moved (A m9, x05500, becomes a
    // six-fret stretch with the open strings barred) loses to any that fits.
    const score = (shift === 0 || MOVABLE.has(base) ? shift : shift + 12) + (reach(moved) > 3 ? 24 : 0);
    if (!best || score < best.score) best = { score, frets: moved };
  }
  let frets = best.frets;
  if (parsed.bass && NOTE_INDEX[parsed.bass] !== undefined) frets = withBass(frets, NOTE_INDEX[parsed.bass], NOTE_INDEX[parsed.root]);
  const max = Math.max(...frets.filter((f) => f !== 'x'));
  if (max > 15) return null; // unplayably high; better to show nothing
  return frets;
}

// Put the bass of a slash chord (C/G, D/F#, Am/G) on the lowest string that
// can take it within the hand's reach (four frets, or an open string): the
// low E, else the A string, else the D string, muting the strings below it.
// The chord's own root must still sound somewhere: Am7/C as x32010 would just
// be a C chord. If nothing fits, the chord is shown without its bass rather
// than as an unplayable stretch or a different chord.
const pitches = (frets) => frets.map((f, i) => (f === 'x' ? null : (OPEN[i] + f) % 12));

function withBass(frets, bass, root) {
  const lowest = frets.findIndex((f) => f !== 'x');
  if (lowest >= 0 && (OPEN[lowest] + frets[lowest]) % 12 === bass) return frets;
  const fits = [];
  for (const string of [0, 1, 2]) {
    const others = frets.filter((f, i) => i > string && f !== 'x' && f !== 0);
    const f = (bass - OPEN[string] + 12) % 12;
    const lo = Math.min(f || Infinity, ...others);
    const hi = Math.max(f, ...others);
    if (f !== 0 && hi - lo > 3) continue;
    const out = frets.slice();
    out[string] = f;
    for (let i = 0; i < string; i++) out[i] = 'x';
    if (!pitches(out).includes(root)) continue;
    fits.push({ f, out });
  }
  // An open bass string is the easiest to play: D/A is x00232, not 5x0232.
  const pick = fits.find((c) => c.f === 0) || fits[0];
  return pick ? pick.out : frets;
}

// Whether the diagrams' fingerings hold for a song's tuning. They do when the
// strings keep the standard intervals (4ths and a 3rd between G and B), so a
// half-step-down song reads the same shapes; Drop D or open D do not, and
// showing standard shapes there would teach the wrong fingering. A tuning that
// cannot be read (empty, "standard", free text) is taken as standard.
const STANDARD_STEPS = [5, 5, 5, 4, 5];
export function shapesFit(tuning) {
  const notes = String(tuning ?? '').trim().split(/\s+/);
  if (notes.length !== 6 || notes.some((n) => NOTE_INDEX[n] === undefined)) return true;
  return notes.slice(1).every((n, i) =>
    (NOTE_INDEX[n] - NOTE_INDEX[notes[i]] + 12) % 12 === STANDARD_STEPS[i]);
}

// The index finger laid across several strings: the lowest fret used,
// starting on one of the two bass strings and reaching the high e, with
// nothing open or muted in between. F (133211), Bb (x13331) and Bm7 (x24232)
// qualify; A (x02220) and D (xx0232) do not.
export function barre(frets) {
  const fretted = frets.filter((f) => f !== 'x' && f !== 0);
  if (!fretted.length) return null;
  const fret = Math.min(...fretted);
  const on = frets.map((f, i) => (f === fret ? i : -1)).filter((i) => i >= 0);
  if (on.length < 2 || on[0] > 1 || on[on.length - 1] !== 5) return null;
  const from = on[0];
  for (let i = from; i <= 5; i++) if (frets[i] === 'x' || frets[i] === 0) return null;
  return { fret, from, to: 5 };
}

// 6-string, 5-fret grid as SVG. Shows the nut in first position, otherwise a
// fret-number label; 'x'/'o' markers above the strings.
export function diagramSvg(frets) {
  const fretted = frets.filter((f) => f !== 'x' && f !== 0);
  const maxF = fretted.length ? Math.max(...fretted) : 1;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  // First displayed fret: the nut while the shape fits in the first four
  // frets, else its lowest fret (Gm7 at 353333 reads from the 3rd).
  const base = maxF <= 4 ? 1 : minF;
  const X0 = 26, Y0 = 30, SX = 17, SY = 19;

  let s = '';
  for (let i = 0; i < 6; i++) {
    s += `<line x1="${X0 + i * SX}" y1="${Y0}" x2="${X0 + i * SX}" y2="${Y0 + 5 * SY}" class="cd-line"/>`;
  }
  for (let j = 0; j <= 5; j++) {
    const w = j === 0 && base === 1 ? ' cd-nut' : '';
    s += `<line x1="${X0}" y1="${Y0 + j * SY}" x2="${X0 + 5 * SX}" y2="${Y0 + j * SY}" class="cd-line${w}"/>`;
  }
  if (base > 1) s += `<text x="${X0 - 10}" y="${Y0 + SY * 0.65}" class="cd-fr">${base}</text>`;
  const bar = barre(frets);
  if (bar) {
    const y = Y0 + (bar.fret - base) * SY + SY / 2;
    s += `<rect x="${X0 + bar.from * SX - 6.5}" y="${y - 6.5}" width="${(bar.to - bar.from) * SX + 13}" height="13" rx="6.5" class="cd-dot"/>`;
  }
  frets.forEach((f, i) => {
    const x = X0 + i * SX;
    if (f === 'x') s += `<text x="${x}" y="${Y0 - 9}" class="cd-mark">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${Y0 - 12}" r="4" class="cd-open"/>`;
    else s += `<circle cx="${x}" cy="${Y0 + (f - base) * SY + SY / 2}" r="6.5" class="cd-dot"/>`;
  });
  return `<svg viewBox="0 0 137 132" width="137" height="132" aria-hidden="true">${s}</svg>`;
}

// Singleton popover anchored to a tapped .chord span. Any tap outside,
// Escape, or scrolling dismisses it.
let pop = null;
let dismiss = null;

export function hideChordPopover() {
  if (dismiss) dismiss();
}

export function showChordPopover(chordEl, { shapes = true } = {}) {
  const token = chordEl.textContent.trim();
  hideChordPopover();

  const frets = shapes ? chordShape(token) : null;
  pop = document.createElement('div');
  pop.className = 'chord-pop';
  pop.innerHTML = `<div class="cd-name">${escapeHtml(token)}</div>${
    frets ? diagramSvg(frets) : `<div class="cd-none">${shapes ? 'no diagram' : 'not for this tuning'}</div>`}`;
  document.body.append(pop);

  // Below the chord if it fits, else above; clamped to the viewport.
  const r = chordEl.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 8);
  let y = r.bottom + 8;
  if (y + ph > window.innerHeight - 8) y = r.top - ph - 8;
  pop.style.left = x + 'px';
  pop.style.top = Math.max(8, y) + 'px';

  // Any tap dismisses, popover included: it is removed on pointerdown, so a
  // tap "through" it still clicks the chord underneath and reopens there.
  const onDown = () => dismiss();
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
  dismiss = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', dismiss);
    pop.remove();
    pop = null;
    dismiss = null;
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('scroll', dismiss, { passive: true, once: true });
}

// Convenience: delegate chord taps inside a rendered tab body.
export function enableChordPopovers($body, opts) {
  $body.addEventListener('click', (e) => {
    const c = e.target.closest('.chord');
    if (c) showChordPopover(c, opts);
  });
}
