import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { join, relative } from 'node:path';
import { ROOT, db } from './db.js';
import { auth, apiAuth, authEnabled } from './auth.js';
import { songs } from './songs.js';
import { collections } from './collections.js';
import { sources } from './sources/index.js';

const app = new Hono();

// Liveness probe for the homelab. Deliberately reads the database: a process
// that is up but whose SQLite file is missing or unreadable is not healthy,
// and that is the failure a plain TCP check would miss. Left unauthenticated
// (it is outside /api) so a monitor does not need a session, and it exposes
// nothing but a row count.
app.get('/healthz', (c) => {
  try {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM songs').get();
    return c.json({ ok: true, songs: n });
  } catch (err) {
    return c.json({ ok: false, error: err.message }, 503);
  }
});

// Default deny: every /api route requires a session except the auth
// endpoints themselves (see PUBLIC_API in auth.js).
app.use('/api/*', apiAuth);
app.route('/api', auth);
app.route('/api/songs', songs);
app.route('/api/collections', collections);
app.route('/api/sources', sources);

// serveStatic resolves against process.cwd(), so hand it a CWD-relative path
// to the project's public/ dir to work from any launch directory.
app.use('/*', serveStatic({ root: relative(process.cwd(), join(ROOT, 'public')) }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`OpenTabs listening on http://localhost:${port}`);
  if (!authEnabled) {
    console.log('Auth disabled (set OPENTABS_PASSWORD to enable). Do not expose to the internet like this.');
  }
});
