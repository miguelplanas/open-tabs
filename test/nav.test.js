// Tests for the router's navigation bookkeeping (public/js/nav.js). The router
// in app.js used to re-route from every stale view, and two overlapping
// navigations kept making each other stale forever (thousands of API calls,
// a POST /played per lap). These drive the same begin/settle logic with fake
// views whose loading we control.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNav } from '../public/js/nav.js';

// A miniature of route() in app.js: every call starts a navigation, waits for
// its view and acts on settle(). Views finish only when the test says so.
function harness() {
  const nav = createNav();
  const pending = [];
  const log = { routes: 0, commits: [], discarded: 0 };
  async function route() {
    const my = nav.begin();
    log.routes++;
    await new Promise((resolve) => pending.push({ my, resolve }));
    const outcome = nav.settle(my);
    if (outcome === 'commit') log.commits.push(my);
    else {
      log.discarded++;
      if (outcome === 'repaint') route();
    }
  }
  // Finish the oldest loading view and let its continuation run.
  async function finishOldest() {
    const p = pending.shift();
    p.resolve();
    await new Promise((r) => setImmediate(r));
    return p.my;
  }
  // Finish views in arrival order until nothing is loading (bounded, so a
  // regression to the old loop fails instead of hanging).
  async function drain(max = 50) {
    let n = 0;
    while (pending.length && n++ < max) await finishOldest();
    return pending.length;
  }
  return { nav, route, log, pending, finishOldest, drain };
}

test('a single navigation commits', async () => {
  const h = harness();
  h.route();
  assert.equal(await h.drain(), 0);
  assert.deepEqual(h.log.commits, [1]);
  assert.equal(h.log.routes, 1);
});

test('two overlapping navigations settle without looping', async () => {
  const h = harness();
  h.route(); // e.g. first back
  h.route(); // second back before the first view loaded
  assert.equal(await h.drain(), 0, 'navigations kept re-routing each other');
  // The stale view finished first and may have drawn over the newest one's
  // skeleton, so the newest repaints exactly once, after it finished.
  assert.equal(h.log.routes, 3);
  assert.deepEqual(h.log.commits, [3]);
});

test('a stale view never re-routes while the newest is still loading', async () => {
  const h = harness();
  h.route();
  h.route();
  await h.finishOldest(); // the stale one
  assert.equal(h.log.routes, 2, 're-routing now would make the newest stale');
  assert.equal(h.pending.length, 1);
});

test('a stale view that lands after the newest painted repaints once', async () => {
  const h = harness();
  h.route();
  h.route();
  const newest = h.pending.pop();
  newest.resolve();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.log.commits, [2]);
  assert.equal(await h.drain(), 0);
  assert.equal(h.log.routes, 3);
  assert.deepEqual(h.log.commits, [2, 3]);
});

test('many overlapping navigations end with one commit', async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) h.route();
  assert.equal(await h.drain(), 0);
  assert.equal(h.log.routes, 6);
  assert.deepEqual(h.log.commits, [6]);
});

test('a quiet navigation after an overlap commits straight away', async () => {
  const h = harness();
  h.route();
  h.route();
  await h.drain();
  const before = h.log.routes;
  h.route();
  await h.drain();
  assert.equal(h.log.routes, before + 1);
});

test('settle outcomes', () => {
  const nav = createNav();
  const a = nav.begin();
  const b = nav.begin();
  assert.equal(nav.current(), b);
  assert.equal(nav.settle(a), 'discard');
  assert.equal(nav.settle(b), 'repaint');
  const c = nav.begin();
  assert.equal(nav.settle(c), 'commit');
  const d = nav.begin();
  const e = nav.begin();
  assert.equal(nav.settle(e), 'commit');
  assert.equal(nav.settle(d), 'repaint');
});
