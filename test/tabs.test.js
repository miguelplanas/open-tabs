// Tests for the bottom tab bar's route-to-tab mapping (public/js/tabs.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABS, tabForHash } from '../public/js/tabs.js';
import { icon } from '../public/js/icons.js';

test('the library is the Songs tab, with or without a hash', () => {
  for (const h of ['', '#', '#/', '/']) assert.equal(tabForHash(h), 'songs', h);
  assert.equal(tabForHash(undefined), 'songs');
});

test('a collection keeps the Collections tab lit', () => {
  assert.equal(tabForHash('#/collections'), 'collections');
  assert.equal(tabForHash('#/collection/12'), 'collections');
});

test('online search is the Search tab, also with a query', () => {
  assert.equal(tabForHash('#/search'), 'search');
  assert.equal(tabForHash('#/search?q=wonderwall'), 'search');
});

test('reader, editor, preview and login hide the bar', () => {
  for (const h of ['#/song/3', '#/edit/3', '#/new', '#/preview', '#/login', '#/nope']) {
    assert.equal(tabForHash(h), null, h);
  }
});

test('every tab points at a route that lights itself and has a known icon', () => {
  for (const t of TABS) {
    assert.equal(tabForHash(t.hash), t.id, t.id);
    assert.doesNotThrow(() => icon(t.icon), t.icon);
    assert.match(t.label, /^\w+$/, 'one-word label');
  }
});

test('the service worker precaches tabs.js', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/js\/tabs\.js'/);
});

test('the tab bar has an opaque background so list rows do not show through', () => {
  const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
  const rule = css.match(/\n\.tabbar \{([^}]*)\}/)[1];
  assert.match(rule, /background:\s*var\(--bg\)/);
  assert.doesNotMatch(rule, /--glass|backdrop-filter/);
});

test('the top bar clears the iOS blur under the status bar', () => {
  // iOS 26+ blurs the top of the screen below the status bar; a header that
  // starts right at the safe area has its title and buttons half blurred.
  const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
  const rule = css.match(/\n\.topbar \{([^}]*)\}/)[1];
  assert.match(rule, /padding:\s*calc\(var\(--s2\) \+ var\(--safe-top\) \+ min\(var\(--safe-top\), 36px\)\)/);
});
