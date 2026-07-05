# Writing a tab source provider

A provider is an ES module in this directory exporting:

```js
export const name = 'my-source';        // URL-safe id, used in /api/sources/:name/...
export const label = 'My Source';       // shown in the UI

// Optional: hostnames fetchTab accepts. Exposed via GET /api/sources so the
// frontend can route a pasted tab URL to the right provider.
export const hosts = ['www.my-source.com'];

// Return an array of results for a free-text query:
// [{ title, artist, type, version, rating, votes, url }]
// `url` is whatever fetchTab needs to retrieve the tab (usually the page URL).
// `version` (optional, default 1) distinguishes multiple takes of the same
// song: the search view groups results by song + artist and lists versions.
// Only return results fetchTab can actually import (no paid/video formats).
export async function search(q) { ... }

// Given a result url, return an importable song:
// { title, artist, body, capo, tuning, source, source_url }
// `body` is plain monospace text (chords over lyrics / ASCII tab).
export async function fetchTab(url) { ... }
```

Register it in `index.js` by adding the module to the providers list.
The frontend needs no changes: the "Search online" view lists all registered
providers and uses these two endpoints.
