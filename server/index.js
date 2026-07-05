import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { join, relative } from 'node:path';
import { ROOT } from './db.js';
import { auth, apiAuth, authEnabled } from './auth.js';
import { songs } from './songs.js';
import { collections } from './collections.js';
import { sources } from './sources/index.js';

const app = new Hono();

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
