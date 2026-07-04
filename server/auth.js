import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PASSWORD = process.env.OPENTABS_PASSWORD || '';
// Session tokens are HMACs of a per-process secret, so restarting the server
// invalidates old sessions. Fine for a single-user app.
const SECRET = randomBytes(32);
const COOKIE = 'opentabs_session';

const validToken = () =>
  createHmac('sha256', SECRET).update('session-v1').digest('hex');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const authEnabled = PASSWORD.length > 0;

export function requireAuth(c, next) {
  if (!authEnabled) return next();
  const token = getCookie(c, COOKIE);
  if (token && safeEqual(token, validToken())) return next();
  return c.json({ error: 'unauthorized' }, 401);
}

export const auth = new Hono();

auth.get('/session', (c) =>
  c.json({
    authEnabled,
    loggedIn: !authEnabled || safeEqual(getCookie(c, COOKIE) || '', validToken()),
  })
);

auth.post('/login', async (c) => {
  const { password } = await c.req.json().catch(() => ({}));
  if (!authEnabled) return c.json({ ok: true });
  if (!safeEqual(password || '', PASSWORD)) {
    return c.json({ error: 'wrong password' }, 401);
  }
  setCookie(c, COOKIE, validToken(), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return c.json({ ok: true });
});

auth.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});
