// Restore an Ultimate Guitar account's saved tabs into the OpenTabs library.
//
//   node scripts/import-ug.js          # dry run: report what would happen
//   node scripts/import-ug.js --go     # actually import
//
// Two pages are read with the session cookie (see ug-lib.js):
//
//   /user/mytabs     favourites, personal tabs and contributions
//   /user/playlist   the account's playlists (UG calls them songbooks)
//
// Each of those lists becomes an OpenTabs collection whose
// collection_songs.position mirrors the order UG displays. A tab that appears
// in several lists is stored once and joined into each of them, and a final
// pass rewrites updated_at so the library's default "Recent" sort reproduces
// the same overall order. created_at keeps the date UG recorded for the entry,
// so when you saved a tab survives the move.
//
// Safe to interrupt and re-run: songs are keyed on the url UG listed for them,
// so a later run resumes and only fetches what is missing. Pro and Official
// tabs are paid formats with no plain-text body and cannot be imported; they
// are listed in the report at the end.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, ROOT, DEFAULT_SCROLL_SPEED } from '../server/db.js';
import { readCookie, fetchPage, jsStore } from './ug-lib.js';
import { parseTab, name as SOURCE } from '../server/sources/ultimate-guitar.js';

const GO = process.argv.includes('--go');
// --limit N stops after N newly fetched tabs, for a smoke test before the full run.
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity;

const MYTABS_URL = 'https://www.ultimate-guitar.com/user/mytabs';
const PLAYLIST_URL = 'https://www.ultimate-guitar.com/user/playlist';
const REPORT = join(ROOT, 'data/ug-import-report.json');

// Politeness: UG sits behind Cloudflare and 600 requests in a burst is how you
// get a challenge page (or a flagged account). One request every ~1.4s puts the
// whole library at roughly 15 minutes, which is fine for a one-off restore.
const DELAY_MS = Number(process.env.UG_DELAY_MS) || 1400;

// Only these carry a plain-text body. Pro (Guitar Pro files) and Official
// (licensed interactive tabs) have nothing to store.
const IMPORTABLE = new Set(['Chords', 'Tabs', 'Bass Tabs', 'Ukulele Chords', 'Drum Tabs']);

const LIST_NAMES = {
  favorite: 'UG favorites',
  personal: 'My UG tabs',
  contributions: 'My UG contributions',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const tabUrl = (id) => `https://tabs.ultimate-guitar.com/tab/${id}`;

const findSong = db.prepare('SELECT id FROM songs WHERE source_url = ?');
const insertSong = db.prepare(`
  INSERT INTO songs (title, artist, body, capo, tuning, scroll_speed,
                     source, source_url, created_at, updated_at)
  VALUES (@title, @artist, @body, @capo, @tuning, @scroll_speed,
          @source, @source_url, @created_at, @updated_at)`);
const setUpdated = db.prepare('UPDATE songs SET updated_at = ? WHERE source_url = ?');
const findCollection = db.prepare('SELECT id FROM collections WHERE name = ?');
const insertCollection = db.prepare(
  'INSERT INTO collections (name, description) VALUES (?, ?)'
);
const addMember = db.prepare(`
  INSERT OR IGNORE INTO collection_songs (collection_id, song_id, position)
  VALUES (?, ?, ?)`);

async function loadPage(url, cookie) {
  const { status, body } = await fetchPage(url, cookie);
  if (status !== 200) throw new Error(`HTTP ${status} from ${url}`);
  const store = jsStore(body);
  if (!store) throw new Error(`no js-store on ${url}`);
  return store;
}

// Both pages are flattened to the same entry shape, so lists and playlists are
// one concept from here on: an ordered, named bucket of tabs.
async function fetchLists(cookie) {
  const mytabs = await loadPage(MYTABS_URL, cookie);
  const user = mytabs?.store?.user;
  if (!user?.id) throw new Error('not logged in: the cookie is expired or incomplete');
  const rows = mytabs?.store?.page?.data?.list?.list;
  if (!Array.isArray(rows)) throw new Error('page layout changed: no tab list found');

  const lists = [];
  for (const [key, name] of Object.entries(LIST_NAMES)) {
    const entries = rows
      .filter((r) => r.tab_type === key)
      .map((r) => ({
        tab_id: r.tab_id,
        title: r.song_name || '',
        artist: r.band_name || '',
        url: r.song_url || tabUrl(r.tab_id),
        type: r.type || '',
        date: r.date,
      }));
    if (entries.length) lists.push({ key, name, entries });
  }

  await sleep(DELAY_MS);
  const playlists = await loadPage(PLAYLIST_URL, cookie);
  for (const sb of playlists?.store?.page?.data?.songbooks ?? []) {
    const entries = (sb.tabs ?? [])
      .map((e) => e.tab)
      .filter(Boolean)
      .map((t) => ({
        tab_id: t.id,
        title: t.song_name || '',
        artist: t.artist_name || '',
        url: t.tab_url || tabUrl(t.id),
        type: t.type || '',
        // Playlist entries carry the tab's publication date, not when it was
        // added, so the songbook's own date is the closer thing to "saved on".
        date: sb.date,
      }));
    if (entries.length) lists.push({ key: `playlist:${sb.id}`, name: sb.name, entries });
  }
  return { user, lists };
}

// One song per tab, even when it sits in several lists: the membership rows
// carry the duplication instead of the library doing so.
function plan(lists) {
  const byTab = new Map(); // tab_id -> { entry, buckets: [key] }
  const order = new Map(); // bucket key -> ordered tab_ids
  const skipped = new Map();

  for (const list of lists) {
    const ids = [];
    for (const entry of list.entries) {
      if (!IMPORTABLE.has(entry.type)) { skipped.set(entry.tab_id, entry); continue; }
      if (!byTab.has(entry.tab_id)) byTab.set(entry.tab_id, { entry, buckets: [] });
      const item = byTab.get(entry.tab_id);
      if (!item.buckets.includes(list.key)) item.buckets.push(list.key);
      if (!ids.includes(entry.tab_id)) ids.push(entry.tab_id);
    }
    order.set(list.key, ids);
  }
  return { items: [...byTab.values()], order, skipped: [...skipped.values()] };
}

function ensureCollections(lists, order) {
  const ids = {};
  for (const list of lists) {
    const n = order.get(list.key)?.length ?? 0;
    if (!n) continue;
    ids[list.key] = findCollection.get(list.name)?.id
      ?? insertCollection.run(list.name, `Imported from Ultimate Guitar (${n} tabs)`).lastInsertRowid;
  }
  return ids;
}

const cookie = readCookie();
const { user, lists } = await fetchLists(cookie);
const { items, order, skipped } = plan(lists);

console.log(`Account: ${user.username} (id ${user.id})`);
for (const list of lists) {
  console.log(`  ${list.name}: ${order.get(list.key).length}`);
}
console.log(`Unique importable tabs: ${items.length}`);
if (skipped.length) {
  const kinds = skipped.reduce((m, r) => ((m[r.type] = (m[r.type] || 0) + 1), m), {});
  console.log(`Not importable (no plain text): ${skipped.length}`, kinds);
}
const already = items.filter((i) => findSong.get(i.entry.url)).length;
console.log(`Already in the library: ${already}`);
console.log(`To fetch now: ${items.length - already}`);

if (!GO) {
  console.log(`\nDry run. Estimated time: ~${Math.ceil(((items.length - already) * DELAY_MS) / 60000)} min.`);
  console.log('Re-run with --go to import.');
  process.exit(0);
}

const colIds = ensureCollections(lists, order);
const failures = [];
let imported = 0, resumed = 0;

for (const [i, { entry, buckets }] of items.entries()) {
  if (imported >= LIMIT) break;
  // Always the url the list gave us. UG mixes three shapes (/tab/<id>, the
  // slug form, and /user/tab/view?h=… for private personal tabs) and only the
  // listed one is guaranteed to resolve. It is also stable across runs, which
  // is what makes resuming an interrupted import exact.
  const url = entry.url;
  const label = `${entry.title} - ${entry.artist}`;
  const progress = `[${String(i + 1).padStart(3)}/${items.length}]`;

  let songId = findSong.get(url)?.id;
  if (songId) {
    resumed++;
  } else {
    try {
      await sleep(DELAY_MS);
      const { status, body } = await fetchPage(url, cookie);
      if (status !== 200) throw new Error(`HTTP ${status}`);
      const store = jsStore(body);
      if (!store) throw new Error('no js-store on page');
      const tab = parseTab(store, url);
      songId = insertSong.run({
        title: tab.title || entry.title,
        artist: tab.artist || entry.artist,
        body: tab.body,
        capo: tab.capo,
        tuning: tab.tuning,
        scroll_speed: DEFAULT_SCROLL_SPEED,
        source: SOURCE,
        source_url: url,
        created_at: sqlTime(entry.date * 1000),
        updated_at: sqlTime(Date.now()),
      }).lastInsertRowid;
      imported++;
      console.log(`${progress} ${label}`);
    } catch (err) {
      failures.push({ tab_id: entry.tab_id, url, title: label, type: entry.type, error: err.message });
      console.log(`${progress} FAILED ${label}: ${err.message}`);
      continue;
    }
  }

  for (const key of buckets) {
    if (!colIds[key]) continue;
    addMember.run(colIds[key], songId, order.get(key).indexOf(entry.tab_id));
  }
}

// Final pass: rewrite updated_at across everything that made it in, so the
// library's default sort reproduces the UG order exactly however many resumed
// runs it took to get here. Newest first, one second apart.
const base = Date.now();
db.transaction(() => {
  items.forEach((it, i) => setUpdated.run(sqlTime(base - i * 1000), it.entry.url));
})();

const report = {
  ran_at: new Date().toISOString(),
  account: user.username,
  lists: lists.map((l) => ({ name: l.name, tabs: order.get(l.key).length })),
  imported,
  already_present: resumed,
  failures,
  not_importable: skipped.map((r) => ({
    tab_id: r.tab_id, type: r.type, title: `${r.title} - ${r.artist}`, url: r.url,
  })),
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));

console.log(`\nImported ${imported}, already present ${resumed}, failed ${failures.length}.`);
console.log(`${skipped.length} Pro/Official entries have no plain text and were left out.`);
console.log(`Full report: ${REPORT}`);
