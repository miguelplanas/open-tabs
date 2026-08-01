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

// --- Reflow ---------------------------------------------------------------
// A chord line and the lyric under it are one unit of meaning, but rendered as
// two independent monospace lines they both have to fit the screen, and the
// chord line is mostly padding spaces. That is what forces a 120-column song
// down to a 6px font on a phone.
//
// Reflow binds every chord to the word it sits over and emits those pairs as
// inline boxes, so the line wraps like a paragraph at whatever font size you
// can actually read. A word never splits, which is what keeps a chord above
// its own syllable. Cells are at least as wide as their chord, so chords never
// collide; that is the one visible cost, slightly wider word spacing.

// Chord tokens of a line with the column each one starts at.
function chordColumns(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) if (isChordToken(m[0])) out.push({ col: m.index, text: m[0] });
  return out;
}

// `chords` is a list because two chords can share a column (a change on the
// same syllable). Each one stays its own .chord span: merging them into one
// would silently stop them transposing and break the fingering popover.
function cellHtml(chords, text, semitones) {
  const top = chords
    .map((c) => `<span class="chord">${escapeHtml(transposeChord(c, semitones))}</span>`)
    .join(' ');
  return `<span class="cell"><span class="ch">${top}</span><span class="ly">${escapeHtml(text)}</span></span>`;
}

// One chord line plus its lyric line, as wrappable words.
function pairHtml(chordLine, lyricLine, semitones) {
  const chords = chordColumns(chordLine);
  const words = [];
  const re = /\S+/g;
  let m;
  let ci = 0;
  while ((m = re.exec(lyricLine))) {
    const start = m.index;
    const end = start + m[0].length;
    // Everything up to the end of this word belongs to it, so chords sitting
    // in the gap before a word attach to that word rather than being lost.
    const mine = [];
    while (ci < chords.length && chords[ci].col < end) mine.push(chords[ci++]);

    const cuts = [...new Set(mine.map((c) => Math.max(0, c.col - start)))].sort((a, b) => a - b);
    if (cuts[0] !== 0) cuts.unshift(0);
    let html = '';
    for (let i = 0; i < cuts.length; i++) {
      const slice = m[0].slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : undefined);
      // Two chords on the same column render side by side in one cell.
      const here = mine.filter((c) => Math.max(0, c.col - start) === cuts[i]).map((c) => c.text);
      html += cellHtml(here, slice, semitones);
    }
    words.push(`<span class="word">${html}</span>`);
  }
  // Chords past the end of the lyric: instrumental tails, each its own word.
  for (const c of chords.slice(ci)) {
    words.push(`<span class="word">${cellHtml([c.text], '', semitones)}</span>`);
  }
  // Joined by a real space, deliberately outside the boxes: that space is both
  // the gap between words and the only place the browser is allowed to break
  // the line, since each word is nowrap.
  return `<span class="row pair">${words.join(' ')}</span>`;
}

// Render a plain-text tab body to HTML with chords highlighted and transposed.
//
// Runs of consecutive ASCII tablature lines are wrapped in one `.tabblock`.
// Staves are typically far wider than the chord/lyric lines around them, and a
// stave only makes sense with all six strings aligned, so the block gets its
// own horizontal scroll (see app.css) instead of dragging the whole song down
// to an unreadable font size to fit its widest line.
// With `reflow`, chord and lyric lines are paired and wrapped (see above) so
// nothing needs a smaller font to fit; staves keep their own scroll either way,
// since tablature cannot be reflowed without destroying it.
export function renderBody(body, semitones = 0, { reflow = false } = {}) {
  const out = [];
  const lines = body.split('\n');
  let stave = [];
  // Reflowed rows are block boxes, so they bring their own line breaks and are
  // joined with nothing. Plain rows are inline in a <pre> and rely on newlines.
  // Mixing the two would double every gap in the song.
  const row = (html) => (reflow ? `<span class="row">${html}</span>` : html);
  const flushStave = () => {
    if (stave.length === 0) return;
    out.push(row(`<span class="tabblock">${stave.join('\n')}</span>`));
    stave = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isTabLine(line)) {
      stave.push(`<span class="tabline">${escapeHtml(line)}</span>`);
      continue;
    }
    flushStave();
    if (!reflow) {
      out.push(renderLine(line, semitones));
      continue;
    }
    if (isChordLine(line)) {
      // Pair with the line below when it is lyrics; a chord line on its own
      // (an intro or a break) still goes through the same path with no lyric,
      // so it wraps as chord boxes instead of overflowing.
      const next = lines[i + 1];
      const paired = next !== undefined && next.trim() && !isChordLine(next) && !isTabLine(next);
      out.push(pairHtml(line, paired ? next : '', semitones));
      if (paired) i++;
      continue;
    }
    if (/^\[.*\]\s*$/.test(line.trim())) {
      out.push(`<span class="row section">${escapeHtml(line)}</span>`);
      continue;
    }
    // A lyric line with no chords over it still has to wrap on a narrow screen.
    out.push(line.trim()
      ? `<span class="row flow">${escapeHtml(line)}</span>`
      : '<span class="row"></span>');
  }
  flushStave();
  return out.join(reflow ? '' : '\n');
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
