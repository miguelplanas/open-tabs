// Reader settings changed with no signal must not be lost, and must win over
// a stale offline copy of the song (public/js/reader-settings.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueSettings, pendingFor, allPending, settleSettings, withPending, PENDING_KEY,
} from '../public/js/reader-settings.js';

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('a queued change overrides the loaded copy until it is delivered', () => {
  const s = memStore();
  queueSettings(s, 7, { scroll_speed: 9, transpose: -2 });
  const song = { id: 7, title: 'x', scroll_speed: 6, transpose: 0 };
  assert.deepEqual(withPending(song, pendingFor(s, 7)), { ...song, scroll_speed: 9, transpose: -2 });
  assert.equal(withPending(song, pendingFor(s, 8)), song);
  assert.deepEqual(allPending(s), [{ id: 7, scroll_speed: 9, transpose: -2 }]);
});

test('delivery clears the entry, but not a newer change made meanwhile', () => {
  const s = memStore();
  queueSettings(s, 7, { scroll_speed: 9, transpose: -2 });
  queueSettings(s, 7, { scroll_speed: 9, transpose: -3 });
  settleSettings(s, 7, { scroll_speed: 9, transpose: -2 });
  assert.deepEqual(pendingFor(s, 7), { scroll_speed: 9, transpose: -3 });
  settleSettings(s, 7, { scroll_speed: 9, transpose: -3 });
  assert.equal(pendingFor(s, 7), null);
  assert.equal(s.getItem(PENDING_KEY), null);
});

test('a broken or missing store never throws', () => {
  const bad = { getItem: () => '{nope', setItem: () => { throw new Error('full'); }, removeItem() {} };
  queueSettings(bad, 1, { scroll_speed: 1, transpose: 1 });
  assert.equal(pendingFor(bad, 1), null);
  assert.deepEqual(allPending(bad), []);
});
