// Tests for shared provider helpers (server/sources/lib.js): HTML-entity
// decoding, which is what keeps accented titles/artists readable after import.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities } from '../server/sources/lib.js';

test('decodes named Latin-1 entities used in Spanish/Portuguese titles', () => {
  assert.equal(decodeEntities('Garc&iacute;a'), 'García');
  assert.equal(decodeEntities('Ni&ntilde;o'), 'Niño');
  assert.equal(decodeEntities('caf&eacute;'), 'café');
  assert.equal(decodeEntities('cora&ccedil;&atilde;o'), 'coração');
});

test('decodes numeric (decimal and hex) entities', () => {
  assert.equal(decodeEntities('&#225;guila'), 'águila');
  assert.equal(decodeEntities('&#x00e9;poca'), 'época');
});

test('decodes basic markup entities', () => {
  assert.equal(decodeEntities('5 &lt; 10 &gt; 2'), '5 < 10 > 2');
  assert.equal(decodeEntities('&quot;quoted&quot;'), '"quoted"');
});

test('&amp; is decoded last so nested entities do not double-decode', () => {
  // &amp;aacute; is a literal "&aacute;", not an "á".
  assert.equal(decodeEntities('&amp;aacute;'), '&aacute;');
  assert.equal(decodeEntities('rock &amp; roll'), 'rock & roll');
});

test('unknown named entities are left untouched', () => {
  assert.equal(decodeEntities('a &bogus; b'), 'a &bogus; b');
});
