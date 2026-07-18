// Tests for guitar chord-diagram derivation (public/js/chord-shapes.js):
// quality canonicalization and barre-shape shifting up the neck.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordShape } from '../public/js/chord-shapes.js';

test('open chords resolve to their canonical shapes', () => {
  assert.deepEqual(chordShape('C'), ['x', 3, 2, 0, 1, 0]);
  assert.deepEqual(chordShape('Am'), ['x', 0, 2, 2, 1, 0]);
  assert.deepEqual(chordShape('G7'), [3, 2, 0, 0, 0, 1]);
  assert.deepEqual(chordShape('Fmaj7'), ['x', 'x', 3, 2, 1, 0]);
});

test('roots without an open form are barred up the neck', () => {
  // F#m is the Em shape shifted up two frets (all fingered strings +2, no opens).
  assert.deepEqual(chordShape('F#m'), [2, 4, 4, 2, 2, 2]);
  // Bb is the A shape shifted up one fret.
  assert.deepEqual(chordShape('Bb'), ['x', 1, 3, 3, 3, 1]);
});

test('CifraClub-style paren extensions map onto template qualities', () => {
  // 7(4) is a 7sus4 voicing, (9) is add9.
  assert.deepEqual(chordShape('A7(4)'), ['x', 0, 2, 0, 3, 0]);
  assert.deepEqual(chordShape('Cadd9'), ['x', 3, 2, 0, 3, 0]);
});

test('extended dominants degrade to the base 7 shape', () => {
  // No dedicated 13 template: it falls back to the closest playable quality.
  assert.deepEqual(chordShape('G13'), chordShape('G7'));
});

test('unknown roots or qualities yield no diagram', () => {
  assert.equal(chordShape('X7'), null);
  assert.equal(chordShape('Hello'), null);
});
