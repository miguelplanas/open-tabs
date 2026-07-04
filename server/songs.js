import { Hono } from 'hono';
import { db } from './db.js';

export const songs = new Hono();

const LIST_COLS =
  'id, title, artist, tags, capo, source, updated_at, played_at';

songs.get('/', (c) => {
  const q = (c.req.query('q') || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT ${LIST_COLS} FROM songs
         WHERE title LIKE ? OR artist LIKE ? OR tags LIKE ?
         ORDER BY played_at DESC NULLS LAST, updated_at DESC`
      )
      .all(like, like, like);
  } else {
    rows = db
      .prepare(
        `SELECT ${LIST_COLS} FROM songs
         ORDER BY played_at DESC NULLS LAST, updated_at DESC`
      )
      .all();
  }
  return c.json(rows);
});

songs.get('/:id', (c) => {
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(c.req.param('id'));
  return row ? c.json(row) : c.json({ error: 'not found' }, 404);
});

const FIELDS = [
  'title', 'artist', 'body', 'capo', 'tuning', 'tags',
  'scroll_speed', 'transpose', 'source', 'source_url',
];

function pick(data) {
  const out = {};
  for (const f of FIELDS) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

songs.post('/', async (c) => {
  const data = pick(await c.req.json().catch(() => ({})));
  if (!data.title || typeof data.title !== 'string') {
    return c.json({ error: 'title is required' }, 400);
  }
  const cols = Object.keys(data);
  const info = db
    .prepare(
      `INSERT INTO songs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    )
    .run(...cols.map((k) => data[k]));
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(info.lastInsertRowid);
  return c.json(row, 201);
});

songs.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = pick(await c.req.json().catch(() => ({})));
  if (Object.keys(data).length === 0) return c.json({ error: 'no fields' }, 400);
  const sets = Object.keys(data).map((k) => `${k} = ?`).join(', ');
  const info = db
    .prepare(`UPDATE songs SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(data), id);
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json(db.prepare('SELECT * FROM songs WHERE id = ?').get(id));
});

// Lightweight "I'm playing this" ping: bumps played_at and optionally persists
// reader settings (scroll speed, transpose) without touching updated_at.
songs.post('/:id/played', async (c) => {
  const id = c.req.param('id');
  const { scroll_speed, transpose } = await c.req.json().catch(() => ({}));
  const sets = ["played_at = datetime('now')"];
  const vals = [];
  if (typeof scroll_speed === 'number') { sets.push('scroll_speed = ?'); vals.push(scroll_speed); }
  if (typeof transpose === 'number') { sets.push('transpose = ?'); vals.push(transpose); }
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
