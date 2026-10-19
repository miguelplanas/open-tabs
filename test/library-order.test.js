// Tests for the library's order modes and A-Z index (public/js/library-order.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeName, readOrder, indexKey, LETTERS, sectionsByLetter, sectionsByArtist,
  letterAt, nearestPresent, compactLetters,
} from '../public/js/library-order.js';

const g = (title, artist = '') => [{ title, artist }];

test('normalizeName drops accents, case and outer spaces', () => {
  assert.equal(normalizeName('  Ángel Señor '), 'angel senor');
  assert.equal(normalizeName(null), '');
});

test('readOrder keeps a new preference and migrates the old one', () => {
  assert.equal(readOrder({ order: 'az' }), 'az');
  assert.equal(readOrder({ order: 'artist' }), 'artist');
  assert.equal(readOrder({ sort: 'recent', grouped: true }), 'artist');
  assert.equal(readOrder({ sort: 'title', grouped: true }), 'artist');
  assert.equal(readOrder({ sort: 'title', grouped: false }), 'az');
  assert.equal(readOrder({ sort: 'artist' }), 'artist');
  assert.equal(readOrder({ sort: 'recent', grouped: false }), 'recent');
  assert.equal(readOrder({ order: 'bogus' }), 'recent');
  assert.equal(readOrder(null), 'recent');
  assert.equal(readOrder('junk'), 'recent');
});

test('indexKey files by accent-free first letter, # for the rest', () => {
  assert.equal(indexKey('Ángel'), 'A');
  assert.equal(indexKey('ñu'), 'N');
  assert.equal(indexKey('  vivo'), 'V');
  assert.equal(indexKey('1979'), '#');
  assert.equal(indexKey('(I Can\'t Get No) Satisfaction'), '#');
  assert.equal(indexKey('¿Dónde?'), '#');
  assert.equal(indexKey(''), '#');
  assert.equal(indexKey(undefined), '#');
});

test('sectionsByLetter orders sections A to Z then #, titles alphabetical', () => {
  const s = sectionsByLetter([g('vivo'), g('2025'), g('Ángel'), g('Puente'), g('apple'), g('Árbol')]);
  assert.deepEqual(s.map((x) => x.key), ['A', 'P', 'V', '#']);
  assert.deepEqual(s[0].items.map((x) => x[0].title), ['Ángel', 'apple', 'Árbol']);
});

test('sectionsByArtist sorts artists and keeps the incoming order inside', () => {
  const s = sectionsByArtist([g('B1', 'Rodriguez'), g('A1', 'Almendra'), g('B2', 'Rodriguez'), g('X')]);
  assert.deepEqual(s.map((x) => x.key), ['Almendra', 'Rodriguez', 'Unknown artist']);
  assert.deepEqual(s[1].items.map((x) => x[0].title), ['B1', 'B2']);
});

test('letterAt maps a finger position onto the full alphabet, clamped', () => {
  assert.equal(letterAt(0, 270), 'A');
  assert.equal(letterAt(269, 270), '#');
  assert.equal(letterAt(-50, 270), 'A');
  assert.equal(letterAt(999, 270), '#');
  assert.equal(letterAt(135, 270), 'N');
  assert.equal(letterAt(10, 0), 'A');
});

test('nearestPresent jumps forward to the next letter with songs, else back', () => {
  const present = new Set(['B', 'M', '#']);
  assert.equal(nearestPresent('B', present), 'B');
  assert.equal(nearestPresent('C', present), 'M');
  assert.equal(nearestPresent('Z', present), '#');
  assert.equal(nearestPresent('A', new Set(['M'])), 'M');
  assert.equal(nearestPresent('Z', new Set(['M'])), 'M');
  assert.equal(nearestPresent('A', new Set()), null);
});

test('compactLetters keeps all when they fit, else a dotted subset with both ends', () => {
  assert.deepEqual(compactLetters(40), LETTERS);
  const c = compactLetters(15);
  assert.ok(c.length <= 15, String(c.length));
  assert.equal(c[0], 'A');
  assert.equal(c.at(-1), '#');
  assert.equal(c[1], '•');
  assert.ok(compactLetters(1).length >= 5);
});

test('the service worker precaches library-order.js', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/js\/library-order\.js'/);
});
