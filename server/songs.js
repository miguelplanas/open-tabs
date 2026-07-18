import { Hono } from 'hono';
import { db, DEFAULT_SCROLL_SPEED } from './db.js';

export const songs = new Hono();

const LIST_COLS =
  'id, title, artist, capo, source, updated_at, played_at';
const listStmt = db.prepare(
  `SELECT ${LIST_COLS} FROM songs
   ORDER BY played_at DESC NULLS LAST, updated_at DESC`
);
const searchStmt = db.prepare(
  `SELECT ${LIST_COLS} FROM songs
   WHERE norm(title) LIKE norm(?) OR norm(artist) LIKE norm(?)
   ORDER BY played_at DESC NULLS LAST, updated_at DESC`
);
const getStmt = db.prepare('SELECT * FROM songs WHERE id = ?');

songs.get('/', (c) => {
  const q = (c.req.query('q') || '').trim();
  const like = `%${q}%`;
  return c.json(q ? searchStmt.all(like, like) : listStmt.all());
});

songs.get('/:id', (c) => {
  const row = getStmt.get(c.req.param('id'));
  return row ? c.json(row) : c.json({ error: 'not found' }, 404);
});

const FIELDS = {
  title: 'string', artist: 'string', body: 'string', tuning: 'string',
  source: 'string', source_url: 'string',
  capo: 'number', scroll_speed: 'number', transpose: 'number',
};

// Whitelist known fields and validate types; returns an error string or
// null. Numbers sent as numeric strings are coerced.
function pick(data, out) {
  for (const [f, type] of Object.entries(FIELDS)) {
    if (data[f] === undefined) continue;
    let v = data[f];
    if (type === 'number' && typeof v === 'string' && v.trim() !== '') v = Number(v);
    if (typeof v !== type || (type === 'number' && !Number.isFinite(v))) {
      return `${f} must be a ${type}`;
    }
    out[f] = v;
  }
  if (out.title !== undefined && out.title.trim() === '') {
    return 'title must not be empty';
  }
  return null;
}

songs.post('/', async (c) => {
  const data = {};
  const err = pick(await c.req.json().catch(() => ({})), data);
  if (err) return c.json({ error: err }, 400);
  if (data.title === undefined) return c.json({ error: 'title is required' }, 400);
  // Apply the gentle default explicitly: existing databases keep the column's
  // old default (20), so relying on it would give new songs the fast speed.
  if (data.scroll_speed === undefined) data.scroll_speed = DEFAULT_SCROLL_SPEED;
  const cols = Object.keys(data);
  const info = db
    .prepare(
      `INSERT INTO songs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    )
    .run(...cols.map((k) => data[k]));
  return c.json(getStmt.get(info.lastInsertRowid), 201);
});

songs.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = {};
  const err = pick(await c.req.json().catch(() => ({})), data);
  if (err) return c.json({ error: err }, 400);
  if (Object.keys(data).length === 0) return c.json({ error: 'no fields' }, 400);
  const sets = Object.keys(data).map((k) => `${k} = ?`).join(', ');
  const info = db
    .prepare(`UPDATE songs SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(data), id);
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json(getStmt.get(id));
});

// Lightweight "I'm playing this" ping: bumps played_at and optionally persists
// reader settings (scroll speed, transpose) without touching updated_at.
songs.post('/:id/played', async (c) => {
  const id = c.req.param('id');
  const { scroll_speed, transpose } = await c.req.json().catch(() => ({}));
  const sets = ["played_at = datetime('now')"];
  const vals = [];
  if (Number.isFinite(scroll_speed)) { sets.push('scroll_speed = ?'); vals.push(scroll_speed); }
  if (Number.isFinite(transpose)) { sets.push('transpose = ?'); vals.push(transpose); }
  const info = db
    .prepare(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`)
    .run(...vals, id);
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

songs.delete('/:id', (c) => {
  const info = db.prepare('DELETE FROM songs WHERE id = ?').run(c.req.param('id'));
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});
