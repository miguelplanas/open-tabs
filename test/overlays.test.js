// Tests for the overlay registry (public/js/overlays.js) that lets the router
// close every open sheet and dialog when you navigate away.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayRegistry } from '../public/js/overlays.js';

// An overlay whose close unregisters itself, like openOverlay() in ui.js.
function fakeOverlay(reg, log, name) {
  let unregister;
  const close = () => { log.push(name); unregister(); };
  unregister = reg.add(close);
  return close;
}

test('closeAll closes every open overlay once and empties the registry', () => {
  const reg = createOverlayRegistry();
  const log = [];
  fakeOverlay(reg, log, 'sheet');
  fakeOverlay(reg, log, 'prompt');
  reg.closeAll();
  assert.deepEqual(log, ['sheet', 'prompt']);
  assert.equal(reg.size, 0);
  reg.closeAll();
  assert.deepEqual(log, ['sheet', 'prompt']);
});

test('an overlay closed by hand is not closed again on navigation', () => {
  const reg = createOverlayRegistry();
  const log = [];
  const closeSheet = fakeOverlay(reg, log, 'sheet');
  fakeOverlay(reg, log, 'dialog');
  closeSheet();
  reg.closeAll();
  assert.deepEqual(log, ['sheet', 'dialog']);
});
