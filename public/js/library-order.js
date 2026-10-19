// How the library orders its songs (Recent, A-Z, Artist) and the A-Z letter
// index on its right edge. Kept free of the DOM so it can be tested with
// node:test; views/library.js does the drawing.

// Accent- and case-insensitive form of a title or artist. Also what groups
// versions of one song (ui.js), the same normalization as norm() in
// server/db.js.
export const normalizeName = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export const ORDERS = [
  { id: 'recent', label: 'Recent' },
  { id: 'az', label: 'A-Z' },
  { id: 'artist', label: 'Artist' },
];

// The saved preference. Before the three-way choice the library stored
// { sort: 'recent' | 'title' | 'artist', grouped: boolean } (a sort select and
// a "By artist" toggle); grouped wins, because that is what the list looked
// like, and an artist sort without grouping is closest to Artist too.
export function readOrder(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  if (ORDERS.some((o) => o.id === p.order)) return p.order;
  if (p.grouped === true || p.sort === 'artist') return 'artist';
  if (p.sort === 'title') return 'az';
  return 'recent';
}

// Letters of the index, in order. '#' (digits and symbols) goes last, as in
// the iOS contacts list.
export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

// Section a title files under: its first letter with accents dropped
// ("Ángel" under A, "Ñu" under N), or '#' when it starts with anything else.
export function indexKey(title) {
  const c = normalizeName(title).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' && c.length === 1 ? c : '#';
}

const byName = (a, b) => normalizeName(a).localeCompare(normalizeName(b));

// `groups` are songs as the library shows them: arrays of versions whose
// first element speaks for the song. Returns [{ key, items }] in LETTERS
// order, titles alphabetical inside each section; empty sections left out.
export function sectionsByLetter(groups) {
  const map = new Map();
  for (const g of groups) {
    const k = indexKey(g[0].title);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(g);
  }
  return LETTERS.filter((k) => map.has(k)).map((k) => ({
    key: k,
    items: map.get(k).sort((a, b) => byName(a[0].title, b[0].title)
      || byName(a[0].artist, b[0].artist)),
  }));
}

// Artist sections, artists alphabetical; inside each, the incoming order
// (most recent first) is kept, as the library always did.
export function sectionsByArtist(groups, unknown = 'Unknown artist') {
  const map = new Map();
  for (const g of groups) {
    const k = g[0].artist || unknown;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(g);
  }
  return [...map.keys()].sort(byName).map((k) => ({ key: k, items: map.get(k) }));
}

// Which letter sits under the finger: `y` is the offset from the top of the
// index and `height` its height. Always over the full LETTERS list, so a
// compacted index (below) still reaches every letter while dragging.
export function letterAt(y, height) {
  if (!(height > 0)) return LETTERS[0];
  const i = Math.floor((y / height) * LETTERS.length);
  return LETTERS[Math.min(LETTERS.length - 1, Math.max(0, i))];
}

// Where to jump for `letter` when it has no songs: the next letter that has
// some, or else the last one before it. null when nothing has songs.
export function nearestPresent(letter, present) {
  const i = LETTERS.indexOf(letter);
  if (i < 0) return null;
  for (let j = i; j < LETTERS.length; j++) if (present.has(LETTERS[j])) return LETTERS[j];
  for (let j = i - 1; j >= 0; j--) if (present.has(LETTERS[j])) return LETTERS[j];
  return null;
}

// On a short screen not every letter fits: keep every other one (or every
// third...) with a dot standing in for the gaps, like iOS. Always keeps the
// first and the last ('#').
export function compactLetters(slots) {
  if (slots >= LETTERS.length) return [...LETTERS];
  const n = Math.max(3, Math.floor((slots + 1) / 2)); // letters shown, dots between
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (LETTERS.length - 1)) / (n - 1));
    if (i > 0) out.push('•');
    out.push(LETTERS[idx]);
  }
  return out;
}
