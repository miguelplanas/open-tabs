// Chord detection, transposition and tab-body rendering.

const NOTE_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// A single chord token: root + quality/extensions + optional bass note.
// 'o' (diminished) and accidental modifiers only count when followed by a
// digit, so lyric words like "Go", "Do" or "Bob" are not mistaken for chords.
// Parenthesized extension groups cover CifraClub-style spellings such as
// A7(4), C7(9), E7(#5) or D9(11/13).
const CHORD_RE =
  /^\(?([A-G][#b]?)((?:maj|min|m|M|dim|aug|sus|add|\+|°|[ob#](?=\d)|\d|\([#b+-]?\d+(?:[,/][#b+-]?\d+)*\))*)(?:\/([A-G][#b]?))?\)?\**$/;

// Tokens allowed on a chord line without being chords themselves.
// Asterisks are footnote markers ("Am *", "Cmaj7 **"): kept in the output
// but they must not stop the line from being detected as a chord line.
const FILLER_RE = /^(\||-|–|x\d+|\(x\d+\)|N\.?C\.?|\.{2,3}|\*+)$/i;

export function isChordToken(tok) {
  return CHORD_RE.test(tok);
}

// Split a chord token into its parts, e.g. "A7(4)/E" →
// { root: 'A', quality: '7(4)', bass: 'E' }. Returns null for non-chords.
export function parseChord(tok) {
  const m = tok.match(CHORD_RE);
  return m ? { root: m[1], quality: m[2] || '', bass: m[3] || null } : null;
}

export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const tok of tokens) {
    if (isChordToken(tok)) chords++;
    else if (!FILLER_RE.test(tok)) return false;
  }
  return chords > 0;
}

// ASCII tablature lines (e|--0--2--) are neither lyrics nor chords.
export function isTabLine(line) {
  return /^[eEbBgGdDaA]?\|?[-0-9hpbrx/\\~|() ]*-{2,}[-0-9hpbrx/\\~|() ]*\|?\s*$/.test(line) &&
    line.includes('-');
}

export function transposeChord(chord, semitones) {
  if (semitones === 0) return chord;
  const m = chord.match(CHORD_RE);
  if (!m) return chord;
  const useFlats = /b/.test(m[1]) || (m[3] && /b/.test(m[3]));
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  const shift = (note) =>
    names[(NOTE_INDEX[note] + (semitones % 12) + 12) % 12];
  let out = chord.replace(m[1], shift(m[1]));
  if (m[3]) {
    // Replace the bass note after the last slash only.
    const idx = out.lastIndexOf('/' + m[3]);
    if (idx !== -1) out = out.slice(0, idx + 1) + shift(m[3]) + out.slice(idx + 1 + m[3].length);
  }
  return out;
}

// Shared with the rest of the app (re-exported by app.js).
export const escapeHtml = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Classify a tab body as 'tabs', 'chords' or 'lyrics'. Used to label the
// versions of a song so you can tell them apart before opening one. A body
// counts as tablature as soon as staves outnumber chord lines: a tab arrangement
// usually carries a few chord lines above the staves, while a chord sheet rarely
// carries any stave at all.
export function detectKind(body) {
  let tabLines = 0;
  let chordLines = 0;
  for (const line of String(body || '').split('\n')) {
    if (!line.trim()) continue;
    if (isTabLine(line)) tabLines++;
    else if (isChordLine(line)) chordLines++;
  }
  if (tabLines > 0 && tabLines >= chordLines) return 'tabs';
  if (chordLines > 0) return 'chords';
  return 'lyrics';
}

function renderLine(line, semitones) {
  if (!isChordLine(line)) {
    if (/^\[.*\]\s*$/.test(line.trim())) {
      return `<span class="section">${escapeHtml(line)}</span>`;
    }
    return escapeHtml(line) || ' ';
  }
  const html = line.replace(/\S+/g, (tok) => {
    if (!isChordToken(tok)) return escapeHtml(tok);
    return `<span class="chord">${escapeHtml(transposeChord(tok, semitones))}</span>`;
  });
  return `<span class="chordline">${html}</span>`;
}

// Render a plain-text tab body to HTML with chords highlighted and transposed.
//
// Runs of consecutive ASCII tablature lines are wrapped in one `.tabblock`.
// Staves are typically far wider than the chord/lyric lines around them, and a
// stave only makes sense with all six strings aligned, so the block gets its
// own horizontal scroll (see app.css) instead of dragging the whole song down
// to an unreadable font size to fit its widest line.
export function renderBody(body, semitones = 0) {
  const out = [];
  let stave = [];
  const flushStave = () => {
    if (stave.length === 0) return;
    out.push(`<span class="tabblock">${stave.join('\n')}</span>`);
    stave = [];
  };
  for (const line of body.split('\n')) {
    if (isTabLine(line)) {
      stave.push(`<span class="tabline">${escapeHtml(line)}</span>`);
      continue;
    }
    flushStave();
    out.push(renderLine(line, semitones));
  }
  flushStave();
  return out.join('\n');
}

// Width, in characters, that the reader should size its font to fit.
//
// The widest line is the wrong target: one malformed 200-char import (or a
// stave, which scrolls on its own) would shrink every lyric in the song. So
// tab lines are ignored and a high percentile of what is left is used, letting
// the rare outlier scroll sideways while everything you actually read stays
// at a comfortable size.
export function fitChars(body, percentile = 0.95) {
  const widths = body
    .split('\n')
    .filter((l) => l.trim() !== '' && !isTabLine(l))
    .map((l) => l.replace(/\s+$/, '').length)
    .sort((a, b) => a - b);
  if (widths.length === 0) return 0;
  return widths[Math.min(widths.length - 1, Math.floor(widths.length * percentile))];
}
