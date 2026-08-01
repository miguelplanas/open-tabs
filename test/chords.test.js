// Tests for the chord engine (public/js/chords.js): detection, transposition
// and body rendering. This module is pure and regex-heavy, so these tests are
// the safety net for the app's most fragile logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isChordToken, isChordLine, isTabLine, parseChord, transposeChord, renderBody,
  fitChars, detectKind,
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

test('renderBody groups a consecutive stave into one scrollable block', () => {
  const stave = ['e|--0--2--|', 'B|--1--3--|', 'G|--0--2--|'].join('\n');
  const out = renderBody(`[Intro]\n${stave}\n\nlyrics`);
  assert.equal(out.match(/class="tabblock"/g).length, 1);
  assert.equal(out.match(/class="tabline"/g).length, 3);
});

test('renderBody keeps separate staves in separate blocks', () => {
  const out = renderBody('e|--0--|\nB|--1--|\n\ne|--2--|\nB|--3--|');
  assert.equal(out.match(/class="tabblock"/g).length, 2);
});

test('fitChars ignores tab staves and tolerates a lone long line', () => {
  const body = [
    'C     G',
    'short lyric line',
    'another short one',
    'e|' + '-'.repeat(200) + '|', // a stave: scrolls on its own, never counted
  ].join('\n');
  assert.ok(fitChars(body) < 40, 'staves must not drive the fitted width');

  // A single outlier among many normal lines is left to scroll sideways
  // rather than shrinking every other line to fit it.
  const withOutlier = [...Array(20).fill('a normal lyric line'), 'x'.repeat(300)].join('\n');
  assert.equal(fitChars(withOutlier), 'a normal lyric line'.length);
});

test('detectKind separates tab arrangements from chord sheets and lyrics', () => {
  const stave = ['e|--0--2--3--|', 'B|--1--3--0--|', 'G|--0--2--0--|'].join('\n');
  assert.equal(detectKind(`[Intro]\nAm  G\n${stave}`), 'tabs');
  assert.equal(detectKind('[Verse]\nC   G   Am\nlyrics here\nF   C\nmore lyrics'), 'chords');
  assert.equal(detectKind('just words\nand more words'), 'lyrics');
  assert.equal(detectKind(''), 'lyrics');
});

test('detectKind calls a chord sheet with one stray stave chords', () => {
  // A chord sheet often ends with a single riff line; that must not turn the
  // whole song into a tab.
  const body = [
    'C     G     Am', 'first line of lyrics',
    'F     C     G', 'second line of lyrics',
    'Am    F', 'third line of lyrics',
    'e|--0--2--3--|',
  ].join('\n');
  assert.equal(detectKind(body), 'chords');
});

test('fitChars is zero for a body with nothing to fit', () => {
  assert.equal(fitChars(''), 0);
  assert.equal(fitChars('\n\n  \n'), 0);
});
