// Tests for oneAtATime (public/js/busy.js), the guard behind the editor's
// Save button: a double tap used to create the same song twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneAtATime } from '../public/js/busy.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('a second tap while the request is in flight sends nothing', async () => {
  const button = { disabled: false };
  const d = deferred();
  let calls = 0;
  const save = oneAtATime(button, () => { calls++; return d.promise; });
  const first = save();
  assert.equal(button.disabled, true);
  await save();
  await save();
  assert.equal(calls, 1);
  d.resolve('ok');
  assert.equal(await first, 'ok');
});

test('the button stays disabled after success (the view is navigating away)', async () => {
  const button = { disabled: false };
  let calls = 0;
  const save = oneAtATime(button, async () => { calls++; });
  await save();
  await save();
  assert.equal(button.disabled, true);
  assert.equal(calls, 1);
});

test('a failure re-enables the button and lets the user retry', async () => {
  const button = { disabled: false };
  let calls = 0;
  const save = oneAtATime(button, async (x) => {
    calls++;
    if (calls === 1) throw new Error('offline');
    return x;
  });
  await assert.rejects(save('a'), /offline/);
  assert.equal(button.disabled, false);
  assert.equal(await save('b'), 'b');
  assert.equal(calls, 2);
});
