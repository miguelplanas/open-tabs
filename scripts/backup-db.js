// Back up the OpenTabs database to a dated file, then verify the copy.
//
//   node scripts/backup-db.js [dir]
//
// Copying opentabs.db with `cp` is not safe while the app is running: in WAL
// mode the newest writes live in the -wal sidecar, so a plain copy can miss
// them or capture a torn state. `VACUUM INTO` takes a proper read snapshot and
// writes a single compact, already-checkpointed file, which is also the file
// you restore by renaming it back over opentabs.db. No sidecars, no ceremony.
//
// The copy is opened and checked afterwards, because a backup you have not
// read back is only a hypothesis.
//
// Destination defaults to $OPENTABS_BACKUP_DIR, then <db dir>/backups.
// Retention: the newest KEEP files are kept, older ones are deleted.

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { db, ROOT } from '../server/db.js';

const KEEP = Number(process.env.OPENTABS_BACKUP_KEEP) || 14;
const DB_PATH = resolve(ROOT, process.env.OPENTABS_DB || 'data/opentabs.db');
const DIR = resolve(
  process.argv[2] || process.env.OPENTABS_BACKUP_DIR || join(dirname(DB_PATH), 'backups')
);

mkdirSync(DIR, { recursive: true });

// Local time, not UTC: a backup named for "yesterday" when you are looking for
// last night's is a bad five minutes to have at 2am.
const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString().slice(0, 19).replaceAll(':', '').replace('T', '-');
// VACUUM INTO refuses to overwrite, so a second run inside the same second
// (a manual retry after a nightly one) gets a suffix instead of an error.
let target = join(DIR, `opentabs-${stamp}.db`);
for (let n = 2; existsSync(target); n++) target = join(DIR, `opentabs-${stamp}-${n}.db`);

db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);

// Read the copy back before trusting it.
const copy = new Database(target, { readonly: true });
const integrity = copy.pragma('integrity_check', { simple: true });
const songs = copy.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
const collections = copy.prepare('SELECT COUNT(*) AS n FROM collections').get().n;
copy.close();

const live = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
if (integrity !== 'ok') throw new Error(`backup failed integrity_check: ${integrity}`);
if (songs !== live) throw new Error(`backup has ${songs} songs, database has ${live}`);

const size = (statSync(target).size / 1024 / 1024).toFixed(2);
console.log(`${target}  ${size} MB  ${songs} songs, ${collections} collections, integrity ok`);

// Retention. Only files this script produces are ever considered, and they are
// ranked by mtime rather than by name: names collide within a second and their
// suffixes do not sort the way the clock does.
const old = readdirSync(DIR)
  .filter((f) => /^opentabs-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.db$/.test(f))
  .map((f) => [f, statSync(join(DIR, f)).mtimeMs])
  .sort((a, b) => a[1] - b[1])
  .slice(0, -KEEP)
  .map(([f]) => f);
for (const f of old) {
  unlinkSync(join(DIR, f));
  console.log(`removed ${f}`);
}
console.log(`keeping the newest ${KEEP}`);
