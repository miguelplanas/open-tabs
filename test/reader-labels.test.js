import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signed, bracket, transposeLabel } from '../public/js/reader-labels.js';

test('signed puts a plus on positive numbers only', () => {
  assert.equal(signed(2), '+2');
  assert.equal(signed(0), '0');
  assert.equal(signed(-3), '-3');
});

test('readouts go in brackets', () => {
  assert.equal(bracket(14), '[14]');
  assert.equal(transposeLabel(5), '[+5]');
  assert.equal(transposeLabel(-1), '[-1]');
});
