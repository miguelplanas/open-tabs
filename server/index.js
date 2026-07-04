import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { auth, requireAuth, authEnabled } from './auth.js';
import { songs } from './songs.js';
import { sources } from './sources/index.js';

const app = new Hono();

app.route('/api', auth);
app.use('/api/songs/*', requireAuth);
app.use('/api/songs', requireAuth);
app.use('/api/sources/*', requireAuth);
app.use('/api/sources', requireAuth);
app.route('/api/songs', songs);
app.route('/api/sources', sources);

app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`OpenTabs listening on http://localhost:${port}`);
  if (!authEnabled) {
    console.log('Auth disabled (set OPENTABS_PASSWORD to enable). Do not expose to the internet like this.');
  }
});
