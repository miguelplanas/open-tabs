// Registry of open overlays (sheets and dialogs), kept free of the DOM so it
// can be tested with node:test. openOverlay() in ui.js registers each one's
// close function, and the router in app.js closes them all on navigation:
// otherwise the reader's tools sheet survived a back gesture, covered the
// library and kept acting on a reader that was no longer on screen.
export function createOverlayRegistry() {
  const open = new Set();
  return {
    // Returns the function that unregisters it (called when it closes).
    add(close) {
      open.add(close);
      return () => open.delete(close);
    },
    // Copy first: each close() unregisters itself while we iterate.
    closeAll() {
      for (const close of [...open]) close();
    },
    get size() {
      return open.size;
    },
  };
}
