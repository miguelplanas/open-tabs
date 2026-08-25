// End-to-end smoke test: boots the real server against a throwaway SQLite file
// in /tmp and exercises it over HTTP. The rest of test/ covers pure logic, so
// this is the only suite that would catch a broken wiring between index.js,
// db.js and the route modules.
//
// The app is spawned as a child process on purpose: server/index.js calls
// serve() at import time and never exports the Hono instance, and db.js opens
// the database while its module body runs. Both mean the environment has to be
// set before the process exists, which rules out importing it in-process.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(tmpdir(), `opentabs-smoke-${process.pid}-${Date.now()}.db`);

let child;
let base;

// Ask the OS for a free port and hand it straight to the app. Slightly racy in
// theory, harmless here, and far more reliable than hardcoding one that a real
// `npm start` on this machine may already be holding.
function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

function startApp(port) {
  return new Promise((ok, fail) => {
    const env = { ...process.env, OPENTABS_DB: DB_PATH, PORT: String(port) };
    // Auth is disabled only when this is unset; drop any value inherited from
    // the developer's shell so the test never needs a session cookie.
    delete env.OPENTABS_PASSWORD;

    const proc = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let stderr = '';
    const timer = setTimeout(
      () => fail(new Error(`server did not start in 10s\nstdout: ${out}\nstderr: ${stderr}`)),
      10_000
    );

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('listening')) {
        clearTimeout(timer);
        ok(proc);
      }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`server exited early (code ${code})\nstderr: ${stderr}`));
    });
  });
}

before(async () => {
  const port = await freePort();
  child = await startApp(port);
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  // WAL mode leaves two sidecar files next to the database; the test owns all
  // three, and they live in /tmp, never in data/.
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(DB_PATH + suffix, { force: true });
  }
});

test('creates the database file with the expected schema', () => {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    for (const t of ['songs', 'sessions', 'collections', 'collection_songs']) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }

    const songCols = db.prepare('PRAGMA table_info(songs)').all().map((c) => c.name);
    for (const col of ['id', 'title', 'artist', 'body', 'capo', 'tuning',
                       'scroll_speed', 'transpose', 'source', 'source_url',
                       'kind', 'created_at', 'updated_at', 'played_at']) {
      assert.ok(songCols.includes(col), `songs is missing column ${col}`);
    }
    // Retired in an earlier migration; its absence is what proves the schema
    // is the current one rather than merely "a songs table".
    assert.ok(!songCols.includes('tags'), 'songs should no longer have a tags column');

    const joinCols = db
      .prepare('PRAGMA table_info(collection_songs)')
      .all()
      .map((c) => c.name);
    assert.deepEqual(
      joinCols.sort(),
      ['added_at', 'collection_id', 'position', 'song_id']
    );
  } finally {
    db.close();
  }
});

test('GET /api/songs answers 200 with a JSON array', async () => {
  const res = await fetch(`${base}/api/songs`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.ok(Array.isArray(await res.json()));
});

test('a created song reads back identically', async () => {
  const payload = {
    title: 'Canción de prueba',
    artist: 'García',
    body: 'C       G\nHola, qué tal\n',
    capo: 2,
    tuning: 'EADGBE',
  };

  const created = await fetch(`${base}/api/songs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 201);
  const song = await created.json();
  assert.ok(Number.isInteger(song.id));
  for (const [k, v] of Object.entries(payload)) assert.equal(song[k], v);
  // Derived server-side from the body on every write, never taken from the
  // client (server/songs.js).
  assert.equal(song.kind, 'chords');

  const read = await fetch(`${base}/api/songs/${song.id}`);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), song);

  const list = await (await fetch(`${base}/api/songs`)).json();
  assert.ok(list.some((s) => s.id === song.id && s.title === payload.title));
});

test('an unknown route answers 404', async () => {
  const res = await fetch(`${base}/api/definitely-not-a-route`);
  assert.equal(res.status, 404);

  const missing = await fetch(`${base}/api/songs/999999`);
  assert.equal(missing.status, 404);
});

// The manifest is the only thing tying the icon files to the installed PWA,
// and a broken link there fails silently: iOS just keeps the old home-screen
// icon. Cheap to assert that every icon it promises is actually served.
test('every icon the manifest references is served', async () => {
  const res = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(res.status, 200);
  const { icons } = await res.json();
  assert.ok(icons.length > 0);

  for (const icon of icons) {
    const got = await fetch(`${base}${icon.src}`);
    assert.equal(got.status, 200, `${icon.src} is not served`);
    assert.equal(got.headers.get('content-type').split(';')[0], icon.type);
  }
});

// A malformed SVG does not fail loudly: the browser abandons the parse and
// draws nothing, which looks exactly like a favicon that was never deployed.
// Serving the file with a 200, which the test above checks, proves nothing.
// Node ships no XML parser, so this covers the two ways this file has actually
// broken rather than pretending to validate the whole grammar.
test('icon.svg is well-formed enough for a browser to draw it', () => {
  const svg = readFileSync(join(ROOT, 'public/icons/icon.svg'), 'utf8');

  // XML forbids "--" inside a comment. Writing the CSS custom property names
  // (the ones spelled with two leading hyphens) into the header comment
  // silently blanked the tab icon in every desktop browser.
  for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) {
    assert.ok(!body.includes('--'), 'an XML comment contains a double hyphen');
  }

  // Every element opened is closed, in order.
  const stack = [];
  for (const [, slash, name, , selfClose] of svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .matchAll(/<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    if (slash) assert.equal(stack.pop(), name, `stray closing tag </${name}>`);
    else if (!selfClose) stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed elements in icon.svg');
});

// The service worker's cache name is a hash of public/, substituted at request
// time (server/index.js). It replaced a hand-bumped counter, so what matters
// is that the substitution actually happens: a placeholder that reached the
// browser would pin every deploy to one cache name for ever, and nothing else
// would notice.
test('/sw.js is served with the shell version substituted', async () => {
  const res = await fetch(`${base}/sw.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  // A cached service worker keeps serving a cached everything.
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const src = await res.text();
  assert.ok(!src.includes('__SHELL_VERSION__'), 'placeholder reached the client');

  const [, version] = src.match(/const SHELL_CACHE = 'opentabs-shell-([^']+)'/);
  assert.match(version, /^[0-9a-f]{12}$/, `not a hash: ${version}`);

  // Stable across requests, or every load would purge the cache.
  const again = await (await fetch(`${base}/sw.js`)).text();
  assert.ok(again.includes(version), 'version changed between requests');
});
