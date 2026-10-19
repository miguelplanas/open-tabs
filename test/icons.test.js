// Tests for the inline SVG icon helper (public/js/icons.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

// A module missing from the SHELL list only reaches the cache if it happened
// to load while online, so the app could open offline without it.
test('the service worker precaches every client module', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  for (const dir of ['js', 'js/views']) {
    const files = readdirSync(new URL(`../public/${dir}/`, import.meta.url)).filter((f) => f.endsWith('.js'));
    for (const f of files) assert.ok(sw.includes(`'/${dir}/${f}'`), `${dir}/${f} missing from SHELL in sw.js`);
  }
});
