// Tests for the setlist bookkeeping (public/js/setlist.js). Switching version
// inside a setlist used to lose it: the new song id was not in the stored
// list, so the reader dropped the prev/next bar and back went to the library.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swapSetlistSong } from '../public/js/setlist.js';

const setlist = { id: 4, name: 'Bolo', ids: [10, 20, 30], titles: ['A', 'B', 'C'] };

test('the new version takes the old one\'s slot', () => {
  const out = swapSetlistSong(setlist, 20, 21);
  assert.deepEqual(out, { id: 4, name: 'Bolo', ids: [10, 21, 30], titles: ['A', 'B', 'C'] });
  assert.deepEqual(setlist.ids, [10, 20, 30], 'input left untouched');
});

test('a version also in the setlist trades places with the old one', () => {
  const out = swapSetlistSong(setlist, 20, 30);
  assert.deepEqual(out.ids, [10, 30, 20]);
  assert.deepEqual(out.titles, ['A', 'C', 'B']);
  assert.deepEqual(setlist.titles, ['A', 'B', 'C'], 'input left untouched');
});

test('a song outside the setlist, or no setlist, changes nothing', () => {
  assert.equal(swapSetlistSong(setlist, 99, 21), setlist);
  assert.equal(swapSetlistSong(null, 20, 21), null);
});
