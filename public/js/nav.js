// Navigation bookkeeping for the hash router in app.js, kept free of the DOM
// so it can be tested with node:test.
//
// Every navigation takes a sequence number with begin(). When its view has
// loaded, settle() says what to do with it:
//   'commit'  it is the newest navigation and nothing drew over it: keep it.
//   'repaint' discard this view and route the current hash again, because the
//             screen may show a stale view: either this one is stale and the
//             newest already finished (so this one may have drawn over it),
//             or this one is the newest but a stale view finished while it
//             was loading.
//   'discard' this view is stale and the newest is still loading: discard it
//             and let the newest repaint when it finishes.
// Re-routing straight away while the newest is still loading is what used to
// loop: the re-route made that one stale too, it re-routed in turn, and so on
// forever. Now every repaint happens after the newest has finished, and each
// stale view settles once, so the repaints run out.
export function createNav() {
  let seq = 0; // newest navigation started
  let done = 0; // newest navigation that finished loading
  let dirty = false; // a stale view finished while the newest was loading
  return {
    begin: () => ++seq,
    current: () => seq,
    settle(my) {
      if (my === seq) {
        done = my;
        if (!dirty) return 'commit';
        dirty = false;
        return 'repaint';
      }
      if (done === seq) return 'repaint';
      dirty = true;
      return 'discard';
    },
  };
}
