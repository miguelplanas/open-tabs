// Tests for guitar chord-diagram derivation (public/js/chord-shapes.js):
// quality canonicalization and barre-shape shifting up the neck.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chordShape, barre, diagramSvg, canonicalQuality, shapesFit, TEMPLATES, placePopover, chordInView,
} from '../public/js/chord-shapes.js';

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
  // No dedicated 11 or altered template: the 7 leaves notes out, adds none.
  assert.deepEqual(chordShape('G11'), chordShape('G7'));
  assert.deepEqual(chordShape('E7#9'), chordShape('E7'));
  assert.deepEqual(chordShape('A7(b13)'), chordShape('A7'));
});

// Chord tones of every template quality, in semitones above the root. The
// test below checks every voicing in the table against them, so a new
// voicing typed with a wrong fret fails here instead of on the music stand.
const TONES = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  add9: [0, 2, 4, 7], 9: [0, 2, 4, 7, 10], 13: [0, 4, 7, 9, 10], maj9: [0, 2, 4, 7, 11],
  mmaj7: [0, 3, 7, 11], m9: [0, 2, 3, 7, 10], madd9: [0, 2, 3, 7], add11: [0, 4, 5, 7],
  dim: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], 5: [0, 7],
};
// Notes a voicing must not leave out: the root and whatever names the chord.
const MUST = {
  '': [4], m: [3], 7: [4, 10], m7: [3, 10], maj7: [4, 11], sus2: [2], sus4: [5],
  '7sus4': [5, 10], 6: [4, 9], m6: [3, 9], add9: [2, 4], 9: [2, 4, 10], 13: [4, 9, 10],
  maj9: [2, 4, 11], mmaj7: [3, 11], m9: [2, 3, 10], madd9: [2, 3], add11: [4, 5],
  dim: [3, 6], m7b5: [3, 6, 10], aug: [4, 8], 5: [7],
};
const OPEN = [4, 9, 2, 7, 11, 4];
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

test('every voicing in the table plays exactly its chord', () => {
  for (const [quality, voicings] of Object.entries(TEMPLATES)) {
    assert.ok(TONES[quality], `no tones listed for ${quality}`);
    for (const [root, frets] of voicings) {
      const notes = new Set(frets.flatMap((f, i) => (f === 'x' ? [] : [(OPEN[i] + f - NOTE[root] + 12) % 12])));
      const name = `${root}${quality} ${frets.join('')}`;
      for (const n of notes) assert.ok(TONES[quality].includes(n), `${name} plays a note outside the chord`);
      for (const n of [0, ...MUST[quality]]) assert.ok(notes.has(n), `${name} leaves out ${n}`);
    }
  }
});

test('every root in every quality gets a diagram within the hand\'s reach', () => {
  const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const spell = { '': '', 5: '5', 13: '13', 6: '6', 7: '7', 9: '9' };
  const bad = [];
  for (const quality of Object.keys(TEMPLATES)) {
    for (const root of roots) {
      const name = root + (spell[quality] ?? quality);
      const f = chordShape(name);
      if (!f) { bad.push(`${name} none`); continue; }
      const fretted = f.filter((x) => x !== 'x' && x !== 0);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > 3) bad.push(`${name} ${f.join(' ')}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('chord spellings from different sites land on the same voicing', () => {
  const same = (spellings, quality) => {
    for (const q of spellings) assert.equal(canonicalQuality(q), quality, `"${q}"`);
  };
  same(['maj7', 'M7', '7M', '(maj7)'], 'maj7');
  same(['mmaj7', 'mM7', 'm7M', 'm(maj7)', 'mmaj7'], 'mmaj7');
  same(['madd9', 'm(9)', 'madd2', 'm2'], 'madd9');
  same(['m9'], 'm9');
  same(['maj9', 'M9'], 'maj9');
  same(['9', '7(9)'], '9');
  same(['add9', '(9)', 'add2'], 'add9');
  same(['add11', '(11)'], 'add11');
  same(['13', '13b9'], '13');
  same(['7', '11', '7#9', '7b9', '7(#11)', '7(b13)'], '7');
  same(['m7', 'm11', 'm13', 'min7'], 'm7');
  same(['sus4', 'sus', '4', '(4)'], 'sus4');
  same(['7sus4', '7(4)', '7sus'], '7sus4');
  same(['sus2', '2', '7sus2', '6sus2'], 'sus2');
  same(['6', '69', '6add9', '6(9)'], '6');
  same(['dim', 'dim7', '°', 'o7'], 'dim');
  same(['m7b5', 'm7(b5)'], 'm7b5');
  same(['aug', '+'], 'aug');
  same(['', 'maj', 'M'], '');
  same(['m', 'min'], 'm');
  same(['5'], '5');
});

test('rare spellings of the root still get a diagram', () => {
  assert.deepEqual(chordShape('Cb7'), chordShape('B7'));
  assert.deepEqual(chordShape('E#'), chordShape('F'));
});

test('a slash chord keeps its root and can take its bass on the D string', () => {
  // Bass only reachable on the D string: the strings below it are muted.
  assert.deepEqual(chordShape('C/D'), ['x', 'x', 0, 0, 1, 0]);
  assert.deepEqual(chordShape('Bb/D'), ['x', 'x', 0, 3, 3, 1]);
  assert.deepEqual(chordShape('E/D'), ['x', 'x', 0, 1, 0, 0]);
  // x32010 would be a plain C chord: without a playable bass, Am7 stays Am7.
  assert.deepEqual(chordShape('Am7/C'), chordShape('Am7'));
  for (const c of ['C/D', 'Bb/D', 'E/D', 'Em/D#', 'C#/E#', 'Am/D']) {
    const f = chordShape(c);
    const low = f.findIndex((x) => x !== 'x');
    const bass = { D: 2, 'D#': 3, 'E#': 5 }[c.split('/')[1]];
    assert.equal((OPEN[low] + f[low]) % 12, bass, `${c} ${f.join('')}`);
  }
});

test('diagrams are kept for tunings that keep the standard intervals', () => {
  assert.ok(shapesFit(''));
  assert.ok(shapesFit('E A D G B E'));
  assert.ok(shapesFit('Eb Ab Db Gb Bb Eb')); // half a step down: same fingerings
  assert.ok(shapesFit('D G C F A D')); // a whole step down
  assert.ok(!shapesFit('D A D G B E')); // Drop D
  assert.ok(!shapesFit('D A D F# A D')); // open D
  assert.ok(shapesFit('Standard')); // unreadable: taken as standard
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

// The chord popover opens above the chord name, so the lines still to come
// stay readable while autoscroll runs.
const chordAt = (top) => ({ top, bottom: top + 20, left: 100, width: 20 });

test('placePopover opens above the chord when it fits under the top bar', () => {
  assert.deepEqual(placePopover(chordAt(400), 160, 170, 400, 100), { x: 30, y: 222, side: 'above' });
});

test('placePopover falls back to below when the top bar is in the way', () => {
  assert.deepEqual(placePopover(chordAt(200), 160, 170, 400, 100), { x: 30, y: 228, side: 'below' });
});

test('placePopover keeps the diagram inside the screen sideways', () => {
  assert.equal(placePopover({ top: 400, bottom: 420, left: 0, width: 20 }, 160, 170, 400, 100).x, 8);
  assert.equal(placePopover({ top: 400, bottom: 420, left: 390, width: 20 }, 160, 170, 400, 100).x, 232);
});

test('chordInView is false once the chord is under the top bar or below the screen', () => {
  assert.equal(chordInView(chordAt(400), 100, 800), true);
  assert.equal(chordInView(chordAt(70), 100, 800), false);
  assert.equal(chordInView(chordAt(810), 100, 800), false);
});
