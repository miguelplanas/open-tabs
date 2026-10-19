// The online search's route, #/search or #/search?q=..., kept free of the
// DOM so it can be tested with node:test. The library links here to run its
// current query online.

// Matches the hash; group 1 is the query string, if any.
export const SEARCH_ROUTE = /^#\/search(?:\?(.*))?$/;

export function onlineSearchHash(q) {
  const query = String(q ?? '').trim();
  return query ? '#/search?q=' + encodeURIComponent(query) : '#/search';
}

// The q parameter of a query string, or '' when there is none.
export function queryFromSearchParams(qs) {
  try {
    return (new URLSearchParams(qs || '').get('q') || '').trim();
  } catch {
    return '';
  }
}
