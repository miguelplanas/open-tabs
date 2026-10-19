// Tests for the online search's start page helpers (public/js/search-history.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecent, loadRecent, saveRecent, parseLink, RECENT_KEY } from '../public/js/search-history.js';

test('addRecent puts the newest first and drops older copies', () => {
  assert.deepEqual(addRecent([], 'wonderwall'), ['wonderwall']);
  assert.deepEqual(addRecent(['a', 'Wonderwall', 'b'], ' wonderwall '), ['wonderwall', 'a', 'b']);
  assert.deepEqual(addRecent(['hey  jude'], 'Hey Jude'), ['Hey Jude']);
});

test('addRecent keeps eight and ignores empty queries', () => {
  const ten = Array.from({ length: 10 }, (_, i) => 'q' + i);
  const out = addRecent(ten, 'new');
  assert.equal(out.length, 8);
  assert.equal(out[0], 'new');
  assert.deepEqual(addRecent(['a'], '   '), ['a']);
  assert.deepEqual(addRecent(null, 'x'), ['x']);
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('recent searches survive a round trip through storage', () => {
  const s = fakeStorage();
  saveRecent(s, ['a', 'b']);
  assert.deepEqual(loadRecent(s), ['a', 'b']);
  saveRecent(s, []);
  assert.equal(RECENT_KEY in s.data, false);
  assert.deepEqual(loadRecent(s), []);
});

test('broken or blocked storage reads as no recent searches', () => {
  assert.deepEqual(loadRecent(fakeStorage({ [RECENT_KEY]: '{oops' })), []);
  assert.deepEqual(loadRecent(fakeStorage({ [RECENT_KEY]: '{"a":1}' })), []);
  assert.deepEqual(loadRecent(fakeStorage({ [RECENT_KEY]: '["a",3,"b"]' })), ['a', 'b']);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadRecent(throwing), []);
  assert.doesNotThrow(() => saveRecent(throwing, ['a']));
});

test('parseLink accepts http(s) links only', () => {
  assert.equal(parseLink(' https://tabs.ultimate-guitar.com/tab/x-123 ').hostname, 'tabs.ultimate-guitar.com');
  assert.equal(parseLink('http://example.com/a').protocol, 'http:');
  assert.equal(parseLink('wonderwall'), null);
  assert.equal(parseLink('ftp://example.com'), null);
  assert.equal(parseLink('https://'), null);
  assert.equal(parseLink(''), null);
  assert.equal(parseLink(null), null);
});
