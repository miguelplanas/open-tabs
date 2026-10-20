// Tests for guitar chord-diagram derivation (public/js/chord-shapes.js):
// quality canonicalization and barre-shape shifting up the neck.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordShape, barre, diagramSvg } from '../public/js/chord-shapes.js';

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

test('roots up the neck use the barre shapes guitarists play', () => {
  // Not the G shape moved up (4-3-1-1-1-4): the E-shape barre at the 4th fret.
  assert.deepEqual(chordShape('G#'), [4, 6, 6, 5, 4, 4]);
  assert.deepEqual(chordShape('C#'), ['x', 4, 6, 6, 6, 4]);
  assert.deepEqual(chordShape('C#7'), ['x', 4, 6, 4, 6, 4]);
  // The D shape moves without a barre and stays the nearest for Eb.
  assert.deepEqual(chordShape('Eb'), ['x', 'x', 1, 3, 4, 3]);
});

test('slash chords put their bass on the lowest string within reach', () => {
  assert.deepEqual(chordShape('C/G'), [3, 3, 2, 0, 1, 0]);
  assert.deepEqual(chordShape('D/F#'), [2, 'x', 0, 2, 3, 2]);
  assert.deepEqual(chordShape('Am/G'), [3, 0, 2, 2, 1, 0]);
  assert.deepEqual(chordShape('G/F#'), [2, 2, 0, 0, 0, 3]);
  assert.deepEqual(chordShape('E/G#'), [4, 2, 2, 1, 0, 0]);
  // Out of reach on the low E, so on the A string with the low E muted.
  assert.deepEqual(chordShape('C/B'), ['x', 2, 2, 0, 1, 0]);
  assert.deepEqual(chordShape('G/B'), ['x', 2, 0, 0, 0, 3]);
  // An open string wins when it can take the bass.
  assert.deepEqual(chordShape('D/A'), ['x', 0, 0, 2, 3, 2]);
  assert.deepEqual(chordShape('F/A'), ['x', 0, 3, 2, 1, 1]);
  // A bass the shape already has changes nothing.
  assert.deepEqual(chordShape('C/C'), chordShape('C'));
});

test('dominant 9 and diminished chords get their own voicings', () => {
  assert.deepEqual(chordShape('E9'), [0, 2, 0, 1, 0, 2]);
  assert.deepEqual(chordShape('A9'), ['x', 0, 2, 4, 2, 3]);
  assert.deepEqual(chordShape('Cadd9'), ['x', 3, 2, 0, 3, 0]);
  assert.deepEqual(chordShape('Bdim'), ['x', 2, 3, 4, 3, 4]);
});

test('barre marks the index finger across the strings, not open shapes', () => {
  assert.deepEqual(barre([1, 3, 3, 2, 1, 1]), { fret: 1, from: 0, to: 5 });
  assert.deepEqual(barre(['x', 2, 4, 2, 3, 2]), { fret: 2, from: 1, to: 5 });
  assert.deepEqual(barre(['x', 1, 3, 3, 3, 1]), { fret: 1, from: 1, to: 5 }); // Bb
  assert.equal(barre(['x', 0, 2, 2, 2, 0]), null); // A: three fingers, high e open
  assert.equal(barre(['x', 'x', 0, 2, 3, 2]), null); // D
  assert.equal(barre([0, 2, 2, 0, 0, 0]), null); // Em
});

test('a barre chord diagram draws the barre', () => {
  assert.match(diagramSvg([1, 3, 3, 2, 1, 1]), /<rect /);
  assert.doesNotMatch(diagramSvg(['x', 3, 2, 0, 1, 0]), /<rect /);
});

test('a shape above the 4th fret is drawn from its lowest fret', () => {
  assert.match(diagramSvg([3, 5, 3, 3, 3, 3]), /class="cd-fr">3</); // Gm7
  assert.doesNotMatch(diagramSvg([2, 4, 4, 2, 2, 2]), /class="cd-fr"/); // F#m
});

test('unknown roots or qualities yield no diagram', () => {
  assert.equal(chordShape('X7'), null);
  assert.equal(chordShape('Hello'), null);
});
