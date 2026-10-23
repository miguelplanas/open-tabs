// Tests for the per-session view memory (public/js/view-state.js) that keeps
// the library filter and the last online search across opening a song.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, saveJson, LIBRARY_QUERY_KEY } from '../public/js/view-state.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('a saved library filter comes back', () => {
  const s = fakeStorage();
  saveJson(s, LIBRARY_QUERY_KEY, 'pablopablo');
  assert.equal(loadJson(s, LIBRARY_QUERY_KEY), 'pablopablo');
});

test('an empty filter clears the slot instead of storing it', () => {
  const s = fakeStorage();
  saveJson(s, LIBRARY_QUERY_KEY, 'x');
  saveJson(s, LIBRARY_QUERY_KEY, '');
  assert.deepEqual(s.data, {});
  assert.equal(loadJson(s, LIBRARY_QUERY_KEY), null);
});

test('objects round-trip, so a search keeps its results and expanded rows', () => {
  const s = fakeStorage();
  const state = { source: 'ug', q: 'todavia', rows: [{ title: 'Todavía' }], activeType: 'Chords', open: ['k'] };
  saveJson(s, 'state', state);
  assert.deepEqual(loadJson(s, 'state'), state);
});

test('broken or unavailable storage never throws', () => {
  assert.equal(loadJson(fakeStorage({ k: '{not json' }), 'k'), null);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('x'); } };
  assert.equal(loadJson(throwing, 'k'), null);
  assert.doesNotThrow(() => saveJson(throwing, 'k', 'v'));
  assert.doesNotThrow(() => saveJson(throwing, 'k', null));
});
