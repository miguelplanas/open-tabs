// Request failures shown to the owner (public/js/net.js), and the service
// worker rules that keep the offline copy in front of a bad network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendlyError, NO_CONNECTION, OFFLINE_NOT_SAVED } from '../public/js/net.js';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('network failures and timeouts read as "No connection"', () => {
  assert.equal(friendlyError(new TypeError('Load failed')), NO_CONNECTION);
  assert.equal(friendlyError(Object.assign(new Error('aborted'), { name: 'AbortError' })), NO_CONNECTION);
  assert.equal(friendlyError(Object.assign(new Error('t'), { name: 'TimeoutError' })), NO_CONNECTION);
  assert.equal(friendlyError(new Error('not found')), 'not found');
});

test('the service worker says the same thing when nothing is saved', () => {
  assert.ok(sw.includes(OFFLINE_NOT_SAVED));
  assert.ok(!sw.includes('Offline and not cached'));
});

test('a 5xx from the server falls back to the saved copy', () => {
  assert.match(sw, /res\.status >= 500 && cached/);
});

test('every installed-app icon is part of the offline shell', () => {
  for (const f of ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
    assert.ok(sw.includes(`'/icons/${f}?v=2'`), `${f} missing from SHELL`);
  }
});
