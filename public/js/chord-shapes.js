// Guitar chord diagrams: a small set of open template shapes per chord
// quality, shifted up the neck for roots without an open form (the classic
// E-shape / A-shape barre logic). Rendered as inline SVG in a popover.

import { parseChord, escapeHtml } from './chords.js';

const NOTE_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

// Template shapes: for each quality, open voicings keyed by their root note.
// Strings low E → high e; 'x' muted, 0 open. A chord is built from the
// template whose root needs the smallest shift up the neck.
const TEMPLATES = {
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
    ['C', ['x', 3, 2, 3, 3, 3]], ['D', ['x', 'x', 0, 2, 1, 0]],
  ],
  add9: [
    ['C', ['x', 3, 2, 0, 3, 0]], ['G', [3, 2, 0, 2, 0, 3]],
    ['D', ['x', 'x', 0, 2, 3, 0]], ['A', ['x', 0, 2, 4, 2, 0]],
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

// Map a chord's quality string (already root-less) onto one of the template
// qualities. CifraClub-style paren groups count as extensions: 7(4) → 7sus4,
// (9) → add9. Unmatched extras degrade to the closest base quality.
function canonicalQuality(q) {
  const parens = [...q.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(/[,/]/));
  const flat = q.replace(/\([^)]*\)/g, '');
  const ext = (x) => parens.includes(x);

  if (/dim|°/.test(flat) || /(^|\d)o\d/.test(flat)) return 'dim';
  if (/aug|\+/.test(flat)) return 'aug';
  const minor = /^(m(?!aj)|min)/.test(flat);
  const rest = minor ? flat.replace(/^(min|m(?!aj))/, '') : flat;
  if (minor) {
    if (/7b5/.test(rest)) return 'm7b5';
    if (/6/.test(rest) || ext('6')) return 'm6';
    if (/7|9|11|13/.test(rest) || ext('7')) return 'm7';
    return 'm';
  }
  if (/maj7|M7/.test(flat)) return 'maj7';
  if (/sus2/.test(rest) || (!/\d/.test(rest) && ext('2'))) return 'sus2';
  if (/7/.test(rest) && (/sus/.test(rest) || ext('4'))) return '7sus4';
  if (/sus|(^|\D)4/.test(rest) || ext('4')) return 'sus4';
  if (/^6/.test(rest) || ext('6')) return '6';
  if (/^add9/.test(rest) || (!/\d/.test(rest) && ext('9'))) return 'add9';
  if (/^9/.test(rest)) return '9';
  if (/7|11|13/.test(rest)) return '7';
  if (/^5$/.test(rest)) return '5';
  return '';
}

// Shapes that move up the neck the way guitarists actually play them: the E
// and A shapes as barre chords, and the D shape, which mutes the low strings
// and needs no barre. A C or G shape moved up is technically right but nobody
// plays G# as 4-3-1-1-1-4, so those only win when nothing else fits.
const MOVABLE = new Set(['E', 'A', 'D']);

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
    const score = shift === 0 || MOVABLE.has(base) ? shift : shift + 12;
    if (!best || score < best.score) best = { shift, score, frets };
  }
  let frets = best.frets.map((f) => (f === 'x' ? 'x' : f + best.shift));
  if (parsed.bass && NOTE_INDEX[parsed.bass] !== undefined) frets = withBass(frets, NOTE_INDEX[parsed.bass]);
  const max = Math.max(...frets.filter((f) => f !== 'x'));
  if (max > 15) return null; // unplayably high; better to show nothing
  return frets;
}

// Put the bass of a slash chord (C/G, D/F#, Am/G) on the lowest string that
// can take it within the hand's reach (four frets, or an open string): first
// the low E, then the A string with the low E muted. If neither reaches, the
// chord is shown without its bass rather than as an unplayable stretch.
function withBass(frets, bass) {
  const lowest = frets.findIndex((f) => f !== 'x');
  if (lowest >= 0 && (OPEN[lowest] + frets[lowest]) % 12 === bass) return frets;
  const fits = [];
  for (const string of [0, 1]) {
    const others = frets.filter((f, i) => i > string && f !== 'x' && f !== 0);
    const f = (bass - OPEN[string] + 12) % 12;
    const lo = Math.min(f || Infinity, ...others);
    const hi = Math.max(f, ...others);
    if (f !== 0 && hi - lo > 3) continue;
    const out = frets.slice();
    out[string] = f;
    if (string === 1) out[0] = 'x';
    fits.push({ f, out });
  }
  // An open bass string is the easiest to play: D/A is x00232, not 5x0232.
  const pick = fits.find((c) => c.f === 0) || fits[0];
  return pick ? pick.out : frets;
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

export function showChordPopover(chordEl) {
  const token = chordEl.textContent.trim();
  hideChordPopover();

  const frets = chordShape(token);
  pop = document.createElement('div');
  pop.className = 'chord-pop';
  pop.innerHTML = `<div class="cd-name">${escapeHtml(token)}</div>${
    frets ? diagramSvg(frets) : '<div class="cd-none">no diagram</div>'}`;
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
export function enableChordPopovers($body) {
  $body.addEventListener('click', (e) => {
    const c = e.target.closest('.chord');
    if (c) showChordPopover(c);
  });
}
