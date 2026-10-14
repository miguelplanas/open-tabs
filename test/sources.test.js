// Tests for shared provider helpers (server/sources/lib.js): HTML-entity
// decoding, which is what keeps accented titles/artists readable after import.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curlArgs, decodeEntities } from '../server/sources/lib.js';
import { cleanBody } from '../server/sources/ultimate-guitar.js';

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

test('cleanBody strips UG markers and decodes the tab text', () => {
  assert.equal(cleanBody('[ch]Am[/ch] [ch]C[/ch]'), 'Am C');
  assert.equal(cleanBody('[tab]e|--0--|[/tab]'), 'e|--0--|');
  assert.equal(cleanBody('&iquest;adonde vas?'), '¿adonde vas?');
  assert.equal(cleanBody('&iexcl;ay!'), '¡ay!');
});

test('cleanBody keeps chords aligned over decoded lyrics', () => {
  // The whole point of decoding the body: "&iquest;" is eight columns wide but
  // stands for one character, so leaving it encoded shifts the lyric out from
  // under its chords.
  const body = cleanBody('A       D\n&iquest;que tal?');
  const [chords, lyric] = body.split('\n');
  assert.equal(lyric, '¿que tal?');
  assert.equal(chords.indexOf('D'), 8);
});

test('cleanBody removes characters that draw nothing but occupy a column', () => {
  // Soft hyphen and Unicode line separator, both of which UG ships.
  assert.equal(cleanBody('ma&shy;ana'), 'maana');
  assert.equal(cleanBody('one&#8232;two'), 'one\ntwo');
});

// The container's own resolver answers SERVFAIL (see lib.js), so the fetch has
// to carry its own way of turning a name into an address.
test('curlGet resolves over HTTPS instead of the system resolver', () => {
  const args = curlArgs(new URL('https://www.ultimate-guitar.com/search.php'));
  const i = args.indexOf('--doh-url');
  assert.notEqual(i, -1, 'no --doh-url in the curl arguments');
  // An IP literal: resolving the resolver must not need a resolver.
  assert.match(args[i + 1], /^https:\/\/\d+\.\d+\.\d+\.\d+\//);
});

test('the DoH endpoint is configurable, and empty falls back to the system resolver', () => {
  const u = new URL('https://www.ultimate-guitar.com/search.php');
  assert.deepEqual(
    curlArgs(u, 'https://9.9.9.9/dns-query').slice(6, 8),
    ['--doh-url', 'https://9.9.9.9/dns-query']
  );
  assert.equal(curlArgs(u, '').includes('--doh-url'), false);
});

test('curlArgs still ends with the URL and asks for the status code', () => {
  const args = curlArgs(new URL('https://tabs.ultimate-guitar.com/tab/x-1'));
  assert.equal(args.at(-1), 'https://tabs.ultimate-guitar.com/tab/x-1');
  assert.equal(args[args.indexOf('-w') + 1], '\n%{http_code}');
});
