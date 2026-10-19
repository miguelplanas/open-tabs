import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  speedForDuration, formatRemaining, formatDuration, parseDuration,
} from '../public/js/autoscroll.js';

test('speedForDuration converts distance and time to px/s', () => {
  assert.equal(speedForDuration(1200, 200), 6);
  assert.equal(speedForDuration(1000, 4), 60); // clamped to the max
  assert.equal(speedForDuration(10, 1000), 1); // clamped to the min
});

test('speedForDuration rejects unusable input', () => {
  for (const [d, s] of [[0, 100], [100, 0], [-1, 5], [NaN, 5], [5, undefined]]) {
    assert.equal(speedForDuration(d, s), null);
  }
});

test('formatRemaining reads as an approximate m:ss', () => {
  assert.equal(formatRemaining(780, 6), '≈2:10');
  assert.equal(formatRemaining(30, 6), '≈0:05');
  assert.equal(formatRemaining(0, 6), '');
  assert.equal(formatRemaining(100, 0), '');
});

test('formatDuration and parseDuration round-trip m:ss', () => {
  assert.equal(formatDuration(185), '3:05');
  assert.equal(parseDuration('3:05'), 185);
  assert.equal(parseDuration(' 12:00 '), 720);
  for (const bad of ['', '3', '3:5', '3:60', 'abc', null]) assert.equal(parseDuration(bad), null, String(bad));
});
