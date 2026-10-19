// The bottom tab bar's model, kept free of the DOM so it can be tested with
// node:test. app.js draws the bar once and, on every navigation, asks
// tabForHash() which tab the route belongs to.
//
// A route inside a section keeps its tab lit (a collection belongs to
// Collections), and the screens where you play, write or decide (reader,
// editor, import preview, login) get no tab at all: there the bar hides, so
// it never sits over the reader's dock or the preview's action bar.

export const TABS = [
  { id: 'songs', label: 'Songs', icon: 'library', hash: '#/' },
  { id: 'collections', label: 'Collections', icon: 'list-music', hash: '#/collections' },
  { id: 'search', label: 'Search', icon: 'search', hash: '#/search' },
];

// Returns 'songs', 'collections', 'search', or null to hide the bar.
export function tabForHash(hash) {
  const path = String(hash || '').replace(/^#/, '').split('?')[0];
  if (path === '' || path === '/') return 'songs';
  if (path === '/collections' || /^\/collection\/\d+$/.test(path)) return 'collections';
  if (path === '/search') return 'search';
  return null;
}
