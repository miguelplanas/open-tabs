import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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
// Answers on /health too because most hosting panels (Dokploy, Coolify, plain
// Docker HEALTHCHECK) default to that path.
app.get('/healthz', health);
app.get('/health', health);

function health(c) {
  try {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM songs').get();
    return c.json({ ok: true, songs: n });
  } catch (err) {
    return c.json({ ok: false, error: err.message }, 503);
  }
}

// Default deny: every /api route requires a session except the auth
// endpoints themselves (see PUBLIC_API in auth.js).
app.use('/api/*', apiAuth);
app.route('/api', auth);
app.route('/api/songs', songs);
app.route('/api/collections', collections);
app.route('/api/sources', sources);

// The service worker names its cache after this hash, so a deploy that changed
// any asset purges the old entries instead of serving them for one more load.
// Computed once at import: the image is immutable, so the value is stable
// across restarts and identical for the same build.
//
// This replaced a hand-bumped counter. Every PR touching public/ had to raise
// it, which meant a conflict whenever two branches raised it to the same
// number, and a rebase could drop the bump without saying anything.
const shellVersion = createHash('sha256')
  .update(
    publicFiles(join(ROOT, 'public'))
      .sort()
      .map((f) => `${relative(ROOT, f)}\0${readFileSync(f).toString('base64')}`)
      .join('\n')
  )
  .digest('hex')
  .slice(0, 12);

function publicFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? publicFiles(full) : [full];
  });
}

// Must be registered before serveStatic below, which would otherwise serve the
// file verbatim, placeholder and all. no-store because a stale service worker
// keeps serving a stale everything.
app.get('/sw.js', (c) => {
  const src = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8')
    .replaceAll('__SHELL_VERSION__', shellVersion);
  return c.body(src, 200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  });
});

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
