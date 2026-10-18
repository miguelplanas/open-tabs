// Tests for the inline SVG icon helper (public/js/icons.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icon, ICON_NAMES } from '../public/js/icons.js';

test('every known icon renders a decorative 24x24 svg', () => {
  assert.ok(ICON_NAMES.length > 0);
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /^<svg class="i" viewBox="0 0 24 24" aria-hidden="true"/, name);
    assert.match(svg, /<\/svg>$/, name);
    assert.match(svg, /<(path|circle|rect) /, name);
  }
});

test('cls adds classes and label makes the icon announced', () => {
  const svg = icon('play', { cls: 'fill', label: 'Play "it"' });
  assert.match(svg, /class="i fill"/);
  assert.match(svg, /role="img" aria-label="Play &quot;it&quot;"/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test('unknown icon names throw', () => {
  assert.throws(() => icon('nope'), /Unknown icon: nope/);
});

test('the service worker precaches icons.js', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/js\/icons\.js'/);
});
