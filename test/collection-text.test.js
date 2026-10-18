// Tests for the collection display helpers (public/js/collection-text.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBoilerplateDescription, visibleDescription } from '../public/js/collection-text.js';

test('the Ultimate Guitar import description is boilerplate', () => {
  assert.equal(isBoilerplateDescription('Imported from Ultimate Guitar (42 tabs)'), true);
  assert.equal(isBoilerplateDescription('Imported from Ultimate Guitar (1 tab)'), true);
  assert.equal(isBoilerplateDescription('Imported from Ultimate Guitar (0 tabs)'), true);
});

test('descriptions written by hand are kept', () => {
  assert.equal(isBoilerplateDescription('Songs for the campfire'), false);
  assert.equal(isBoilerplateDescription('Imported from Ultimate Guitar (42 tabs), then trimmed'), false);
  assert.equal(isBoilerplateDescription('Imported from Ultimate Guitar'), false);
  assert.equal(isBoilerplateDescription(''), false);
  assert.equal(isBoilerplateDescription(null), false);
});

test('visibleDescription drops boilerplate and empty values', () => {
  assert.equal(visibleDescription('Imported from Ultimate Guitar (7 tabs)'), '');
  assert.equal(visibleDescription(null), '');
  assert.equal(visibleDescription(''), '');
  assert.equal(visibleDescription('Wedding setlist'), 'Wedding setlist');
});
