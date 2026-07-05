import { Hono } from 'hono';
import { db } from './db.js';

export const collections = new Hono();

// Columns returned for songs listed inside a collection: enough for a list row
// plus the reader entry point, without shipping full tab bodies.
const SONG_COLS =
  'id, title, artist, capo, source, updated_at, played_at';

const listStmt = db.prepare(`
  SELECT c.id, c.name, c.description, c.color, c.created_at, c.updated_at,
         COUNT(cs.song_id) AS song_count
  FROM collections c
  LEFT JOIN collection_songs cs ON cs.collection_id = c.id
  GROUP BY c.id
  ORDER BY c.updated_at DESC
`);

// Same as listStmt but flags whether a given song is already a member, so the
// "add to collection" picker can render checkboxes in one round trip.
const listForSongStmt = db.prepare(`
  SELECT c.id, c.name, c.description, c.color, c.created_at, c.updated_at,
         COUNT(cs.song_id) AS song_count,
         MAX(CASE WHEN cs.song_id = @song THEN 1 ELSE 0 END) AS member
  FROM collections c
  LEFT JOIN collection_songs cs ON cs.collection_id = c.id
  GROUP BY c.id
  ORDER BY c.updated_at DESC
`);

const getStmt = db.prepare('SELECT * FROM collections WHERE id = ?');
const songsInStmt = db.prepare(`
  SELECT ${SONG_COLS.split(',').map((c) => 's.' + c.trim()).join(', ')}
  FROM collection_songs cs
  JOIN songs s ON s.id = cs.song_id
  WHERE cs.collection_id = ?
  ORDER BY cs.position, cs.added_at
`);
const maxPosStmt = db.prepare(
  'SELECT COALESCE(MAX(position), -1) AS m FROM collection_songs WHERE collection_id = ?'
);
const memberStmt = db.prepare(
  'SELECT 1 FROM collection_songs WHERE collection_id = ? AND song_id = ?'
);

collections.get('/', (c) => {
  const song = c.req.query('song');
  if (song !== undefined) {
    const id = Number(song);
    if (!Number.isInteger(id)) return c.json({ error: 'song must be an integer' }, 400);
    return c.json(listForSongStmt.all({ song: id }));
  }
  return c.json(listStmt.all());
});

collections.get('/:id', (c) => {
  const row = getStmt.get(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ ...row, songs: songsInStmt.all(row.id) });
});

// Validate/whitelist writable collection fields; returns an error string or null.
function pickCollection(data, out, { requireName }) {
  if (data.name !== undefined) {
    if (typeof data.name !== 'string') return 'name must be a string';
    if (data.name.trim() === '') return 'name must not be empty';
    out.name = data.name.trim();
  } else if (requireName) {
    return 'name is required';
  }
  for (const f of ['description', 'color']) {
    if (data[f] === undefined) continue;
    if (typeof data[f] !== 'string') return `${f} must be a string`;
    out[f] = data[f];
  }
  return null;
}

collections.post('/', async (c) => {
  const data = {};
  const err = pickCollection(await c.req.json().catch(() => ({})), data, { requireName: true });
  if (err) return c.json({ error: err }, 400);
  const cols = Object.keys(data);
  const info = db
    .prepare(`INSERT INTO collections (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((k) => data[k]));
  return c.json(getStmt.get(info.lastInsertRowid), 201);
});

collections.put('/:id', async (c) => {
  const data = {};
  const err = pickCollection(await c.req.json().catch(() => ({})), data, { requireName: false });
  if (err) return c.json({ error: err }, 400);
  if (Object.keys(data).length === 0) return c.json({ error: 'no fields' }, 400);
  const sets = Object.keys(data).map((k) => `${k} = ?`).join(', ');
  const info = db
    .prepare(`UPDATE collections SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(data), c.req.param('id'));
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json(getStmt.get(c.req.param('id')));
});

collections.delete('/:id', (c) => {
  const info = db.prepare('DELETE FROM collections WHERE id = ?').run(c.req.param('id'));
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// Bumps the parent collection's updated_at so recency ordering reflects edits
// to its contents, not just its name.
function touch(id) {
  db.prepare("UPDATE collections SET updated_at = datetime('now') WHERE id = ?").run(id);
}

// Add a song at the end of the collection. Idempotent: re-adding an existing
// member is a no-op success rather than an error.
collections.post('/:id/songs', async (c) => {
  const id = c.req.param('id');
  if (!getStmt.get(id)) return c.json({ error: 'not found' }, 404);
  const { song_id } = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(song_id)) return c.json({ error: 'song_id must be an integer' }, 400);
  if (!db.prepare('SELECT 1 FROM songs WHERE id = ?').get(song_id)) {
    return c.json({ error: 'song not found' }, 404);
  }
  if (!memberStmt.get(id, song_id)) {
    const pos = maxPosStmt.get(id).m + 1;
    db.prepare('INSERT INTO collection_songs (collection_id, song_id, position) VALUES (?, ?, ?)')
      .run(id, song_id, pos);
    touch(id);
  }
  return c.json({ ok: true }, 201);
});

collections.delete('/:id/songs/:songId', (c) => {
  const id = c.req.param('id');
  const info = db
    .prepare('DELETE FROM collection_songs WHERE collection_id = ? AND song_id = ?')
    .run(id, c.req.param('songId'));
  if (info.changes === 0) return c.json({ error: 'not found' }, 404);
  touch(id);
  return c.json({ ok: true });
});

// Reorder membership. Body: { order: [songId, ...] }. Any members omitted from
// the list keep their relative order after the listed ones.
collections.put('/:id/songs', async (c) => {
  const id = c.req.param('id');
  if (!getStmt.get(id)) return c.json({ error: 'not found' }, 404);
  const { order } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(order) || !order.every(Number.isInteger)) {
    return c.json({ error: 'order must be an array of integers' }, 400);
  }
  const current = db
    .prepare('SELECT song_id FROM collection_songs WHERE collection_id = ? ORDER BY position, added_at')
    .all(id)
    .map((r) => r.song_id);
  const seen = new Set(order.filter((s) => current.includes(s)));
  const final = [...order.filter((s) => seen.has(s)), ...current.filter((s) => !seen.has(s))];
  const setPos = db.prepare(
    'UPDATE collection_songs SET position = ? WHERE collection_id = ? AND song_id = ?'
  );
  const tx = db.transaction(() => {
    final.forEach((songId, i) => setPos.run(i, id, songId));
    touch(id);
  });
  tx();
  return c.json({ ok: true });
});
