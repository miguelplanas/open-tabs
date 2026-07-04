import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

const PASSWORD = process.env.OPENTABS_PASSWORD || '';
const COOKIE = 'opentabs_session';

const insertSession = db.prepare('INSERT INTO sessions (token) VALUES (?)');
const findSession = db.prepare('SELECT token FROM sessions WHERE token = ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const authEnabled = PASSWORD.length > 0;

function loggedIn(c) {
  if (!authEnabled) return true;
  const token = getCookie(c, COOKIE);
  return Boolean(token && findSession.get(token));
}

// Default-deny middleware for /api/*: everything requires a session except
// the auth endpoints themselves.
const PUBLIC_API = new Set(['/api/session', '/api/login', '/api/logout']);

export function apiAuth(c, next) {
  if (PUBLIC_API.has(c.req.path) || loggedIn(c)) return next();
  return c.json({ error: 'unauthorized' }, 401);
}

// Basic brute-force protection: after 10 failed attempts, block logins
// until the sliding 15-minute window drains. In-memory is fine here: a
// restart resets the counter but also rotates nothing else of value.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
let failures = [];

function failuresInWindow() {
  const cutoff = Date.now() - WINDOW_MS;
  failures = failures.filter((t) => t > cutoff);
  return failures.length;
}

function secureCookie(c) {
  return (
    c.req.header('x-forwarded-proto') === 'https' ||
    new URL(c.req.url).protocol === 'https:'
  );
}

export const auth = new Hono();

auth.get('/session', (c) => c.json({ authEnabled, loggedIn: loggedIn(c) }));

auth.post('/login', async (c) => {
  const { password } = await c.req.json().catch(() => ({}));
  if (!authEnabled) return c.json({ ok: true });
  if (failuresInWindow() >= MAX_FAILURES) {
    return c.json({ error: 'too many attempts, try again later' }, 429);
  }
  if (!safeEqual(password || '', PASSWORD)) {
    failures.push(Date.now());
    return c.json({ error: 'wrong password' }, 401);
  }
  failures = [];
  const token = randomBytes(32).toString('hex');
  insertSession.run(token);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureCookie(c),
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return c.json({ ok: true });
});

auth.post('/logout', (c) => {
  const token = getCookie(c, COOKIE);
  if (token) deleteSession.run(token);
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});
