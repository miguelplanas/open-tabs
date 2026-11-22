// The editor must edit the server's copy, never the saved offline one: Save
// sends the whole song, so an old copy would overwrite newer edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the editor loads the song with a query string', () => {
  assert.match(read('../public/js/views/editor.js'), /api\(`\/songs\/\$\{id\}\?edit=1`\)/);
});

test('the service worker neither stores nor serves query-string URLs from its cache', () => {
  const sw = read('../public/sw.js');
  assert.match(sw, /const cacheableApi = \(url\) =>\s*!url\.search &&/);
  // caches.match without ignoreSearch: ?edit=1 never matches /api/songs/:id.
  assert.ok(!sw.includes('ignoreSearch'));
});

test('an import draft is only cleared once saved or abandoned', () => {
  const src = read('../public/js/views/editor.js');
  const load = src.slice(src.indexOf('const draft ='), src.indexOf('$app.innerHTML'));
  assert.ok(!load.includes('removeItem'), 'draft removed on open');
});
