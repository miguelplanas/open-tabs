// Tests for the offline cache warmer's bookkeeping (public/js/offline.js).
// The warmer used to refetch the whole library on every app start; these pin
// down that it only fetches what is missing or changed, and drops deleted
// songs and collections from the cache.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWarm, nextManifest } from '../public/js/offline.js';

const items = [
  { url: '/api/songs/1', version: '2026-01-01 10:00:00' },
  { url: '/api/songs/2', version: '2026-01-02 10:00:00' },
  { url: '/api/collections/7', version: '2026-01-03 10:00:00' },
];
const fullManifest = Object.fromEntries(items.map((i) => [i.url, i.version]));

test('first start with an empty cache fetches everything', () => {
  const plan = planWarm({ items, cached: new Set(), manifest: {} });
  assert.deepEqual(plan.fetch, items.map((i) => i.url));
  assert.deepEqual(plan.drop, []);
});

test('second start with everything cached and unchanged fetches nothing', () => {
  const cached = new Set(items.map((i) => i.url));
  const plan = planWarm({ items, cached, manifest: fullManifest });
  assert.deepEqual(plan, { fetch: [], drop: [] });
});

test('an edited song is refetched', () => {
  const cached = new Set(items.map((i) => i.url));
  const edited = items.map((i) => (i.url === '/api/songs/2' ? { ...i, version: '2026-02-01 00:00:00' } : i));
  assert.deepEqual(planWarm({ items: edited, cached, manifest: fullManifest }).fetch, ['/api/songs/2']);
});

test('an entry evicted from the cache is refetched even if the manifest has it', () => {
  const cached = new Set(['/api/songs/1', '/api/collections/7']);
  assert.deepEqual(planWarm({ items, cached, manifest: fullManifest }).fetch, ['/api/songs/2']);
});

test('a cached copy with no manifest entry (warmed by an older app) is refetched once', () => {
  const cached = new Set(items.map((i) => i.url));
  const plan = planWarm({ items, cached, manifest: {} });
  assert.equal(plan.fetch.length, items.length);
});

test('deleted songs and collections are dropped, list URLs are kept', () => {
  const cached = new Set([...items.map((i) => i.url), '/api/songs/99', '/api/collections/5', '/api/songs', '/api/collections']);
  const plan = planWarm({ items, cached, manifest: fullManifest });
  assert.deepEqual(plan.drop, ['/api/songs/99', '/api/collections/5']);
  assert.deepEqual(plan.fetch, []);
});

test('the next manifest records fetched and up-to-date entries, not failed ones', () => {
  const cached = new Set(['/api/songs/1']);
  const manifest = { '/api/songs/1': items[0].version, '/api/songs/99': 'x' };
  const fetched = new Set(['/api/collections/7']); // songs/2 failed
  assert.deepEqual(nextManifest({ items, cached, manifest, fetched }), {
    '/api/songs/1': items[0].version,
    '/api/collections/7': items[2].version,
  });
});
