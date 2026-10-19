// Tests for the online search route (public/js/search-route.js): the
// library's 'Search "x" online' row builds the hash, the router matches it
// and the search view reads the query back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_ROUTE, onlineSearchHash, queryFromSearchParams } from '../public/js/search-route.js';

const roundTrip = (q) => queryFromSearchParams(onlineSearchHash(q).match(SEARCH_ROUTE)[1]);

test('the route matches with and without a query', () => {
  assert.equal('#/search'.match(SEARCH_ROUTE)[1], undefined);
  assert.equal('#/search?q=oasis'.match(SEARCH_ROUTE)[1], 'q=oasis');
  assert.equal('#/searching'.match(SEARCH_ROUTE), null);
  assert.equal('#/search/1'.match(SEARCH_ROUTE), null);
});

test('onlineSearchHash encodes the query and drops empty ones', () => {
  assert.equal(onlineSearchHash('  '), '#/search');
  assert.equal(onlineSearchHash(null), '#/search');
  assert.equal(onlineSearchHash('hey jude'), '#/search?q=hey%20jude');
});

test('queries survive the trip through the hash', () => {
  for (const q of ['wonderwall', 'Xoel López', 'AC/DC', 'rock & roll', '50% off?', '#1 hit', 'a+b=c']) {
    assert.equal(roundTrip(q), q);
  }
});

test('queryFromSearchParams tolerates missing or odd input', () => {
  assert.equal(queryFromSearchParams(undefined), '');
  assert.equal(queryFromSearchParams(''), '');
  assert.equal(queryFromSearchParams('x=1'), '');
  assert.equal(queryFromSearchParams('q=a+b'), 'a b');
});
