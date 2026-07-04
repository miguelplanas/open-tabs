import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.OPENTABS_DB || 'data/opentabs.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    capo INTEGER NOT NULL DEFAULT 0,
    tuning TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    scroll_speed REAL NOT NULL DEFAULT 20,
    transpose INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    played_at TEXT
  );
`);
