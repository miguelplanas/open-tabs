// Tests for the chord engine (public/js/chords.js): detection, transposition
// and body rendering. This module is pure and regex-heavy, so these tests are
// the safety net for the app's most fragile logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isChordToken, isChordLine, isTabLine, parseChord, transposeChord, renderBody, wrapStave,
  fitChars, readerLayout, fontStepBase, detectKind, pageStep, pageKeyDirection, uniqueChords,
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

test('transposeChord handles enharmonic roots Cb, B#, Fb and E#', () => {
  assert.equal(transposeChord('Cb', 1), 'C');
  assert.equal(transposeChord('B#', 1), 'C#');
  assert.equal(transposeChord('Fb', 2), 'Gb');
  assert.equal(transposeChord('E#m', 1), 'F#m');
  assert.equal(transposeChord('Cbmaj7/Fb', 1), 'Cmaj7/F');
  assert.equal(transposeChord('A/E#', -1), 'G#/E');
  for (const c of ['Cb', 'B#', 'Fb', 'E#']) {
    for (let s = -11; s <= 11; s++) assert.doesNotMatch(transposeChord(c, s), /undefined/);
  }
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

test('fitChars ignores tab staves and fits the widest line', () => {
  const body = [
    'C     G',
    'short lyric line',
    'another short one',
    'e|' + '-'.repeat(200) + '|', // a stave: scrolls on its own, never counted
  ].join('\n');
  assert.ok(fitChars(body) < 40, 'staves must not drive the fitted width');

  // Even a lone long line counts: left out, it dragged the whole song
  // sideways on a phone (Bajan, a 55-column chord line among 30-column ones).
  // Too wide to fit at a readable size, the song reflows instead.
  const withOutlier = [...Array(20).fill('a normal lyric line'), 'x'.repeat(55)].join('\n');
  assert.equal(fitChars(withOutlier), 55);
});

test('readerLayout: an untouched song shrinks to fit, then reflows', () => {
  assert.deepEqual(readerLayout({ chosen: 14, fitted: 14 }), { reflow: false, font: 14 });
  assert.deepEqual(readerLayout({ chosen: 14, fitted: 12.5 }), { reflow: false, font: 12.5 });
  // Below the readable floor it wraps at the chosen size rather than scroll.
  assert.deepEqual(readerLayout({ chosen: 14, fitted: 9 }), { reflow: true, font: 14 });
});

test('readerLayout: A+ on a fitted song makes the text bigger', () => {
  // The bug: a song shrunk to 11.5px ignored A+, since every bigger size
  // shrank back to the same 11.5px. Picked by the user, the size is honoured
  // and the song wraps to make room.
  const picked = readerLayout({ chosen: 13, fitted: 11.5, sizedByUser: true });
  assert.deepEqual(picked, { reflow: true, font: 13 });
  // A smaller pick that fits keeps the original columns.
  assert.deepEqual(readerLayout({ chosen: 11, fitted: 11, sizedByUser: true }), { reflow: false, font: 11 });
});

test('readerLayout: "Wrap long lines: Off" never reflows', () => {
  assert.deepEqual(readerLayout({ chosen: 14, fitted: 9, reflowPref: 'off' }), { reflow: false, font: 11 });
  assert.deepEqual(readerLayout({ chosen: 16, fitted: 9, reflowPref: 'off', sizedByUser: true }), { reflow: false, font: 16 });
});

test('fontStepBase: the first tap steps from the size on screen', () => {
  assert.equal(fontStepBase({ chosen: 14, shown: 11.54, sizedByUser: false }), 12);
  assert.equal(fontStepBase({ chosen: 13, shown: 13, sizedByUser: true }), 13);
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

test('reflow binds each chord to the word underneath it', () => {
  //      col 0     col 10
  const out = renderBody('C         G\nhello     world', 0, { reflow: true });
  // Two words, each carrying its own chord.
  assert.equal(out.match(/class="word"/g).length, 2);
  assert.match(out, /class="chord">C<\/span><\/span><span class="ly">hello/);
  assert.match(out, /class="chord">G<\/span><\/span><span class="ly">world/);
});

test('reflow gives a chord slot only to words that carry a chord', () => {
  // A wrapped lyric must continue right below: a word with no chord over it
  // reserves no chord row, or the wrap shows up as a blank line.
  const out = renderBody('G\nY ahora está tan cerca, casi ya la puedo oler', 0, { reflow: true });
  assert.equal(out.match(/class="word"/g).length, 10);
  assert.equal(out.match(/class="ch"/g).length, 1);
  assert.match(out, /<span class="word"><span class="cell"><span class="ly">oler<\/span><\/span><\/span>/);
  // A chord landing mid-word: the leading slice has no slot, the rest does.
  const split = renderBody('  G\nhello', 0, { reflow: true });
  assert.match(split, /<span class="cell"><span class="ly">he<\/span><\/span><span class="cell"><span class="ch">/);
});

test('reflow splits a word when a chord lands inside it', () => {
  // The G sits on the fourth character of "hello", so the word becomes two
  // cells and stays one unbreakable word.
  const out = renderBody('C   G\nhello', 0, { reflow: true });
  assert.equal(out.match(/class="word"/g).length, 1);
  assert.equal(out.match(/class="cell"/g).length, 2);
  assert.match(out, /class="ly">hell</);
  assert.match(out, /class="ly">o</);
});

test('reflow keeps chords that run past the end of the lyric', () => {
  const out = renderBody('C   G   Am\nhey', 0, { reflow: true });
  assert.equal(out.match(/class="chord"/g).length, 3);
});

test('reflow transposes and never emits raw markup', () => {
  const out = renderBody('C\n<b>hi</b>', 0, { reflow: true });
  assert.ok(!out.includes('<b>'));
  assert.match(renderBody('C\nhi', 2, { reflow: true }), /class="chord">D</);
});

test('reflow leaves staves and section headers alone', () => {
  const out = renderBody('[Verse]\ne|--0--2--|\nB|--1--3--|', 0, { reflow: true });
  assert.match(out, /class="row section"/);
  assert.equal(out.match(/class="tabblock"/g).length, 1);
  assert.ok(!out.includes('class="row pair"'));
  // Reflowed rows are block boxes and must not also be separated by newlines,
  // or every gap in the song doubles. Newlines inside a stave are the point of
  // the stave, so they stay.
  assert.ok(!/<\/span>\n<span class="row/.test(out));
  assert.match(out, /tabline">e\|--<span class="fret">0<\/span>--<span class="fret">2<\/span>--\|<\/span>\n<span class="tabline"/);
});

test('a repeat count after a stave line does not end the stave', () => {
  assert.ok(isTabLine('D|----------|  X4'));
  assert.ok(isTabLine('e|--0--|  (x2)'));
  const out = renderBody('e|--0--|\nB|--1--|  X4\nG|--0--|');
  assert.equal(out.match(/class="tabblock"/g).length, 1);
});

test('stave lines pick out their fret numbers', () => {
  const out = renderBody('e|--0--12--|');
  assert.match(out, /<span class="fret">0<\/span>--<span class="fret">12<\/span>/);
});

test('wrapStave leaves a stave that fits alone', () => {
  const st = ['e|--0--|', 'B|--1--|'];
  assert.deepEqual(wrapStave(st, 40), [st]);
  assert.deepEqual(wrapStave(st, Infinity), [st]);
});

test('wrapStave cuts a long stave at bar lines and repeats the string names', () => {
  const st = ['e|---0---|---2---|---3---|', 'B|---1---|---3---|-------|', 'G|-------|-12----|---0---|'];
  assert.deepEqual(wrapStave(st, 20), [
    ['e|---0---|---2---|', 'B|---1---|---3---|', 'G|-------|-12----|'],
    ['e|---3---|', 'B|-------|', 'G|---0---|'],
  ]);
});

test('wrapStave without bar lines cuts where every string rests, never inside a fret', () => {
  const st = ['e|' + '--3--12---'.repeat(8), 'B|' + '-'.repeat(80)];
  const pieces = wrapStave(st, 30);
  assert.ok(pieces.length > 1);
  for (const piece of pieces) {
    assert.ok(piece.every((l) => l.length <= 30));
    assert.ok(piece[0].startsWith('e|') && piece[1].startsWith('B|'));
  }
  // Rejoining the pieces gives back every note, none split in two.
  const notes = pieces.map((p) => p[0].slice(2)).join('').match(/\d+/g);
  assert.deepEqual(notes, st[0].slice(2).match(/\d+/g));
});

test('wrapStave fills the width and leaves the remainder for the last piece', () => {
  // No bar lines: a 64-column stave on a 43-column screen is one full line
  // plus the rest, not two half-empty lines.
  const st = ['e|' + '---0---1--'.repeat(6) + '-', 'B|' + '-'.repeat(61)];
  const pieces = wrapStave(st, 43);
  assert.equal(pieces.length, 2);
  assert.ok(pieces[0][0].length >= 40, `first piece only ${pieces[0][0].length} wide`);
});

test('wrapStave keeps a repeat count at the end of the last piece', () => {
  const st = ['e|---0---|---2---|  X4', 'B|---1---|---3---|'];
  const pieces = wrapStave(st, 12);
  assert.equal(pieces.length, 2);
  assert.equal(pieces[1][0], 'e|---2---|  X4');
});

test('renderBody cuts long staves into separate blocks when given a width', () => {
  const st = ['e|---0---|---2---|---3---|', 'B|---1---|---3---|-------|'].join('\n');
  assert.equal(renderBody(st, 0, { staveCols: 20 }).match(/class="tabblock"/g).length, 2);
  assert.equal(renderBody(st, 0, { staveCols: 20, reflow: true }).match(/class="tabblock"/g).length, 2);
  assert.equal(renderBody(st).match(/class="tabblock"/g).length, 1);
});

test('renderBody without reflow is unchanged', () => {
  const body = '[Verse]\nC   G\nlyrics\ne|--0--|';
  assert.equal(renderBody(body, 0), renderBody(body, 0, { reflow: false }));
  assert.ok(!renderBody(body, 0).includes('class="cell"'));
});

test('fitChars is zero for a body with nothing to fit', () => {
  assert.equal(fitChars(''), 0);
  assert.equal(fitChars('\n\n  \n'), 0);
});

test('pageStep scrolls the usable viewport minus two lines of overlap', () => {
  // iPhone-ish: 844 tall, 60 top bar, 70 dock, 20px lines.
  assert.equal(pageStep(844, 60, 70, 20), 844 - 60 - 70 - 40);
  // Rounded to whole pixels.
  assert.equal(pageStep(800, 50.4, 60, 20.3), Math.round(800 - 50.4 - 60 - 40.6));
  // A tiny viewport (landscape, huge font) still moves at least one line.
  assert.equal(pageStep(120, 60, 70, 24), 24);
});

test('pageKeyDirection maps page keys and ignores modifiers and Space', () => {
  for (const key of ['PageDown', 'ArrowDown', 'ArrowRight', 'Enter']) {
    assert.equal(pageKeyDirection({ key }), 1, key);
  }
  for (const key of ['PageUp', 'ArrowUp', 'ArrowLeft']) {
    assert.equal(pageKeyDirection({ key }), -1, key);
  }
  for (const key of [' ', 'a', 'Escape', 'Home', 'Tab']) {
    assert.equal(pageKeyDirection({ key }), 0, key);
  }
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    assert.equal(pageKeyDirection({ key: 'PageDown', [mod]: true }), 0, mod);
  }
});

test('uniqueChords lists each chord once, in order of first appearance', () => {
  const body = '[Intro]\nAm   G\n\nC        G    Am\nsome lyric line\nF*  (G)  A7(4)  (Am)\nAm is in this lyric, not a chord line';
  assert.deepEqual(uniqueChords(body), ['Am', 'G', 'C', 'F', 'A7(4)']);
});

test('uniqueChords ignores staves and handles empty bodies', () => {
  assert.deepEqual(uniqueChords('e|--0--2--|\nB|--1--3--|'), []);
  assert.deepEqual(uniqueChords(''), []);
  assert.deepEqual(uniqueChords(undefined), []);
});

test('section markers render as headings without their brackets', () => {
  for (const reflow of [false, true]) {
    const out = renderBody('[Verse 1]\nC\nhello\n  [Chorus]  ', 0, { reflow });
    assert.match(out, /role="heading" aria-level="2" title="\[Verse 1\]">Verse 1<\/span>/);
    assert.match(out, /title="\[Chorus\]">Chorus<\/span>/);
    // Not mistaken for a chord, and no bracket left in the visible text.
    assert.doesNotMatch(out, />\[(Verse 1|Chorus)\]</);
    assert.equal(out.match(/class="chord"/g).length, 1);
  }
  assert.match(renderBody('[<b>]'), /title="\[&lt;b&gt;\]">&lt;b&gt;</);
});
