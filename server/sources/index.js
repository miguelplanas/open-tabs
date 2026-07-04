import { Hono } from 'hono';
import * as ultimateGuitar from './ultimate-guitar.js';

// Provider contract (see provider.md): { name, label, search(q), fetchTab(url) }
const providers = new Map();
for (const p of [ultimateGuitar]) providers.set(p.name, p);

export const sources = new Hono();

sources.get('/', (c) =>
  c.json([...providers.values()].map(({ name, label }) => ({ name, label })))
);

sources.get('/:name/search', async (c) => {
  const p = providers.get(c.req.param('name'));
  if (!p) return c.json({ error: 'unknown source' }, 404);
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ error: 'missing q' }, 400);
  try {
    return c.json(await p.search(q));
  } catch (err) {
    console.error(`[sources:${p.name}] search failed:`, err);
    return c.json({ error: `search failed: ${err.message}` }, 502);
  }
});

sources.get('/:name/tab', async (c) => {
  const p = providers.get(c.req.param('name'));
  if (!p) return c.json({ error: 'unknown source' }, 404);
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'missing url' }, 400);
  try {
    return c.json(await p.fetchTab(url));
  } catch (err) {
    console.error(`[sources:${p.name}] fetchTab failed:`, err);
    return c.json({ error: `fetch failed: ${err.message}` }, 502);
  }
});
