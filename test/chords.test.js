// Tests for the chord engine (public/js/chords.js): detection, transposition
// and body rendering. This module is pure and regex-heavy, so these tests are
// the safety net for the app's most fragile logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isChordToken, isChordLine, isTabLine, parseChord, transposeChord, renderBody,
} from '../public/js/chords.js';

test('isChordToken accepts real chords', () => {
  for (const t of ['C', 'Am', 'G7', 'Fmaj7', 'C#m7', 'Bb', 'G/B', 'F#m7/A#',
    'Csus4', 'Dadd9', 'Bm7b5', 'A7(4)', 'C7(9)', 'E7(#5)', 'D9(11/13)', 'Am*']) {
    assert.ok(isChordToken(t), `expected chord: ${t}`);
  }
});

test('isChordToken rejects lyric words that look chord-ish', () => {
  // 'o'/accidentals only count as chord modifiers when followed by a digit, so
  // ordinary words are not mistaken for chords.
  for (const w of ['Go', 'Do', 'Bob', 'Add', 'Cab', 'Ade', 'Fade', 'Ebb', 'Gaff']) {
    assert.ok(!isChordToken(w), `expected non-chord: ${w}`);
  }
});

test('isChordLine detects chord-only lines including filler tokens', () => {
  for (const l of ['C   G   Am   F', 'Em7      A7', 'G/B  C  D',
    'N.C.  Am', '| Am | C |', 'A7(4) C7(9) E7(#5)']) {
    assert.ok(isChordLine(l), `expected chord line: ${JSON.stringify(l)}`);
  }
});

test('isChordLine rejects lyric lines', () => {
  for (const l of ['Go to the store', 'Do you remember', 'A man walked in',
    'Bob and Ed', 'I am the one', 'Add more sugar', '']) {
    assert.ok(!isChordLine(l), `expected lyric line: ${JSON.stringify(l)}`);
  }
});

test('isTabLine detects ASCII tablature', () => {
  assert.ok(isTabLine('e|--0--2--3--|'));
  assert.ok(isTabLine('|--5h7p5-------|'));
  assert.ok(!isTabLine('not a tab line'));
  assert.ok(!isTabLine('A A A A'));
});

test('parseChord splits root, quality and bass', () => {
  assert.deepEqual(parseChord('A7(4)/E'), { root: 'A', quality: '7(4)', bass: 'E' });
  assert.deepEqual(parseChord('Cmaj7'), { root: 'C', quality: 'maj7', bass: null });
  assert.deepEqual(parseChord('G'), { root: 'G', quality: '', bass: null });
  assert.equal(parseChord('Hello'), null);
});

test('transposeChord shifts roots and bass notes', () => {
  assert.equal(transposeChord('C', 2), 'D');
  assert.equal(transposeChord('B', 1), 'C');
  assert.equal(transposeChord('B', -1), 'A#');
  assert.equal(transposeChord('Am', -1), 'G#m');
  assert.equal(transposeChord('G/B', 1), 'G#/C');
  assert.equal(transposeChord('F#m7/A#', 1), 'Gm7/B');
  assert.equal(transposeChord('A7(4)/E', 3), 'C7(4)/G');
  assert.equal(transposeChord('E7(#5)', 2), 'F#7(#5)');
});

test('transposeChord keeps flat spelling when the chord is written flat', () => {
  assert.equal(transposeChord('Bb', 2), 'C');
  assert.equal(transposeChord('Db', 1), 'D');
  // A flat root or bass keeps the whole chord on flats.
  assert.equal(transposeChord('Eb', 1), 'E');
});

test('transposeChord is a no-op for zero and for non-chords', () => {
  assert.equal(transposeChord('Am', 0), 'Am');
  assert.equal(transposeChord('Hello', 5), 'Hello');
});

test('renderBody escapes HTML and never emits raw markup', () => {
  const html = renderBody('<script>alert(1)</script> lyric line');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderBody tags chord lines, section headers and tab lines', () => {
  const out = renderBody('[Verse]\nC   G\nlyrics here\ne|--0--2--|');
  assert.match(out, /class="section"/);
  assert.match(out, /class="chordline"/);
  assert.match(out, /class="chord"/);
  assert.match(out, /class="tabline"/);
});

test('renderBody transposes chords inside chord lines', () => {
  const out = renderBody('C   G', 2);
  assert.match(out, /class="chord">D</);
  assert.match(out, /class="chord">A</);
});
