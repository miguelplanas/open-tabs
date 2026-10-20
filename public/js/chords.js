// Chord detection, transposition and tab-body rendering.

const NOTE_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  // Enharmonic spellings CHORD_RE accepts (rare, but they show up in
  // imported tabs); without them a transposed Cb printed "undefined".
  Cb: 11, 'B#': 0, Fb: 4, 'E#': 5,
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
  return /^[eEbBgGdDaA]?\|?[-0-9hpbrxX/\\~|() ]*-{2,}[-0-9hpbrxX/\\~|() ]*\|?\s*$/.test(stripRepeat(line)) &&
    line.includes('-');
}

// A repeat count written after a stave line ("|  X4", "| (x2)"). It belongs to
// the stave, so it must not end it.
const REPEAT_TAIL_RE = /(\|)\s+\(?[xX]\s?\d+\)?\s*$/;
const stripRepeat = (line) => line.replace(REPEAT_TAIL_RE, '$1');

// --- Stave wrapping ------------------------------------------------------
// A stave only reads with its strings aligned, so it used to scroll sideways
// as one block, cut off at the screen edge. With a guitar in your hands you
// cannot drag every stave across. wrapStave cuts it into pieces that fit, the
// way printed tablature runs on in systems: at a bar line when there is one
// in reach, otherwise at a column where every string rests ("-"), so a fret
// number is never split. Each piece repeats the string names.

// The "e|" a stave line starts with, kept on every piece.
const STRING_PREFIX_RE = /^\s*[A-Ga-g]?[#b]?\|/;

export function wrapStave(lines, cols) {
  const parts = lines.map((l) => {
    const m = stripRepeat(l.replace(/\s+$/, '')).match(STRING_PREFIX_RE);
    const prefix = m ? m[0] : '';
    return { prefix, body: stripRepeat(l.replace(/\s+$/, '')).slice(prefix.length) };
  });
  const prefixW = Math.max(...parts.map((p) => p.prefix.length));
  const len = Math.max(...parts.map((p) => p.body.length));
  const width = cols - prefixW;
  if (!Number.isFinite(cols) || len <= width || width < 8) return [lines];

  const at = (c) => parts.map((p) => p.body[c] ?? ' ');
  const isBar = (c) => at(c).every((ch) => ch === '|');
  const isRest = (c) => at(c).every((ch) => ch === '-' || ch === ' ');
  const pieces = [];
  let start = 0;
  while (start < len) {
    let end = Math.min(len, start + width); // exclusive
    if (end < len) {
      // Aim for pieces of even length rather than full ones and a stub: a
      // 70-column stave on a 60-column screen reads better as 35 + 35.
      const rest = len - start;
      const target = start + Math.ceil(rest / Math.ceil(rest / width));
      const best = (ok, shift) => {
        let cut = -1;
        for (let c = Math.ceil(start + width / 3); c < end; c++) {
          if (ok(c) && (cut < 0 || Math.abs(c + shift - target) <= Math.abs(cut - target))) cut = c + shift;
        }
        return cut;
      };
      // A bar line closes its piece (it stays on it); failing that, a column
      // where every string rests, so no fret number is split in two.
      let cut = best(isBar, 1);
      if (cut < 0) cut = best(isRest, 0);
      if (cut > start) end = cut;
    }
    pieces.push(parts.map((p) => p.prefix.padEnd(prefixW) + p.body.slice(start, end)));
    start = end;
  }
  // Repeat counts go at the end of the last piece, where they were written.
  const tails = lines.map((l) => (l.match(REPEAT_TAIL_RE) || [''])[0].slice(1));
  const last = pieces[pieces.length - 1];
  tails.forEach((t, i) => { if (t) last[i] += t; });
  return pieces;
}

// One stave line with its fret numbers picked out: at the distance of the
// music stand the notes are what you look for, not the dashes around them.
function tabLineHtml(line) {
  const tail = (line.match(REPEAT_TAIL_RE) || [''])[0].slice(1); // "  X4" is not a fret
  const stave = tail ? line.slice(0, line.length - tail.length) : line;
  return escapeHtml(stave).replace(/\d+/g, (n) => `<span class="fret">${n}</span>`) + escapeHtml(tail);
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

// Section markers ([Intro], [Verse 1], [Chorus]) as small headings: the
// brackets are typing convention, not something to read on the stand, so they
// go and the name stands alone. The original marker stays in the title.
const SECTION_RE = /^\[(.*)\]\s*$/;
function sectionHtml(line, cls) {
  const name = line.trim().match(SECTION_RE)[1].trim();
  return `<span class="${cls}" role="heading" aria-level="2" title="${escapeHtml(line.trim())}">` +
    `${escapeHtml(name)}</span>`;
}

function renderLine(line, semitones) {
  if (!isChordLine(line)) {
    if (SECTION_RE.test(line.trim())) return sectionHtml(line, 'section');
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
//
// A cell with no chord gets no chord slot at all. The slot reserves a line of
// height, so an empty one on every plain word left a blank line wherever a
// lyric wrapped onto a visual line with no chord above it ("puedo" / blank /
// "oler"). Without it, a wrapped line only grows a chord row when one of its
// words actually carries a chord.
function cellHtml(chords, text, semitones) {
  const top = chords
    .map((c) => `<span class="chord">${escapeHtml(transposeChord(c, semitones))}</span>`)
    .join(' ');
  const slot = top ? `<span class="ch">${top}</span>` : '';
  return `<span class="cell">${slot}<span class="ly">${escapeHtml(text)}</span></span>`;
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
export function renderBody(body, semitones = 0, { reflow = false, staveCols = Infinity } = {}) {
  const out = [];
  const lines = body.split('\n');
  let stave = [];
  // Reflowed rows are block boxes, so they bring their own line breaks and are
  // joined with nothing. Plain rows are inline in a <pre> and rely on newlines.
  // Mixing the two would double every gap in the song.
  const row = (html) => (reflow ? `<span class="row">${html}</span>` : html);
  const flushStave = () => {
    if (stave.length === 0) return;
    const pieces = wrapStave(stave, staveCols).map((piece) =>
      row(`<span class="tabblock">${piece.map((l) => `<span class="tabline">${tabLineHtml(l)}</span>`).join('\n')}</span>`));
    // Pieces of one stave are separated by a blank line, like systems on paper.
    out.push(pieces.join(reflow ? '<span class="row"></span>' : '\n\n'));
    stave = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isTabLine(line)) {
      stave.push(line);
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
    if (SECTION_RE.test(line.trim())) {
      out.push(sectionHtml(line, 'row section'));
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

// The distinct chords of a song in the order they first appear, for the strip
// of diagrams above the reader. Only chord lines count, exactly as the renderer
// sees them, so a lyric word like "Am" in a sentence never sneaks in. Footnote
// asterisks and wrapping parentheses ("(Am)", "G*") are dropped: they mark a
// place in the song, not a different chord. Returned untransposed; the reader
// transposes them with the rest of the song.
export function uniqueChords(body) {
  const seen = new Set();
  const out = [];
  for (const line of String(body || '').split('\n')) {
    if (isTabLine(line) || !isChordLine(line)) continue;
    for (const tok of line.trim().split(/\s+/)) {
      if (!isChordToken(tok)) continue;
      let c = tok.replace(/\*+$/, '');
      if (c.startsWith('(')) c = c.slice(1);
      const open = (c.match(/\(/g) || []).length;
      const close = (c.match(/\)/g) || []).length;
      if (close > open && c.endsWith(')')) c = c.slice(0, -1);
      if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    }
  }
  return out;
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

// Page turning in the reader (keyboard and Bluetooth page-turner pedals).
// Kept here, with no DOM access, so the tests can import it.

// Direction a key turns the page: 1 forward, -1 back, 0 not a page key.
// Space is not here: it keeps toggling autoscroll. Modifier combos are left
// to the browser and the OS (Cmd+Arrow, Alt+Arrow and friends).
const PAGE_FORWARD = new Set(['PageDown', 'ArrowDown', 'ArrowRight', 'Enter']);
const PAGE_BACK = new Set(['PageUp', 'ArrowUp', 'ArrowLeft']);
export function pageKeyDirection(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return 0;
  if (PAGE_FORWARD.has(e.key)) return 1;
  if (PAGE_BACK.has(e.key)) return -1;
  return 0;
}

// Pixels one page turn scrolls: the part of the viewport the song is actually
// visible in (minus the sticky top bar and the dock over the bottom), less two
// lines that stay on screen so the eye keeps its place. Never less than a line.
export function pageStep(viewportH, topbarH, dockH, lineH) {
  const usable = viewportH - topbarH - dockH;
  return Math.max(lineH, Math.round(usable - 2 * lineH));
}
