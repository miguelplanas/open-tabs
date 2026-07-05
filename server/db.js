import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths against the project root so the app works from any CWD.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = resolve(ROOT, process.env.OPENTABS_DB || 'data/opentabs.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
// Needed for ON DELETE CASCADE on collection membership (off by default in SQLite).
db.pragma('foreign_keys = ON');

// Lets searches ignore case and accents (SQLite's LIKE only case-folds ASCII,
// so "garcia" wouldn't otherwise match "García"). Used as norm(col) LIKE
// norm(?) in queries.
db.function('norm', { deterministic: true }, (s) =>
  typeof s === 'string'
    ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : s
);

db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    capo INTEGER NOT NULL DEFAULT 0,
    tuning TEXT NOT NULL DEFAULT '',
    scroll_speed REAL NOT NULL DEFAULT 20,
    transpose INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    played_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Collections (folders/albums/setlists). A song can live in many collections,
  -- and each membership carries an explicit position so album/setlist order is
  -- preserved independently of how the songs sort elsewhere.
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collection_songs (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, song_id)
  );

  CREATE INDEX IF NOT EXISTS idx_collection_songs_song ON collection_songs(song_id);
`);

// Drop the retired free-text `tags` column from databases created before it was
// removed. Guarded so it's a no-op on fresh databases (which never have it).
const songCols = db.prepare('PRAGMA table_info(songs)').all().map((c) => c.name);
if (songCols.includes('tags')) db.exec('ALTER TABLE songs DROP COLUMN tags');

// Sessions older than a year are expired; prune on startup.
db.prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-1 year')").run();
