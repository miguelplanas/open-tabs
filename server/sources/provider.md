# Writing a tab source provider

A provider is an ES module in this directory exporting:

```js
export const name = 'my-source';        // URL-safe id, used in /api/sources/:name/...
export const label = 'My Source';       // shown in the UI

// Return an array of results for a free-text query:
// [{ title, artist, type, rating, votes, url }]
// `url` is whatever fetchTab needs to retrieve the tab (usually the page URL).
export async function search(q) { ... }

// Given a result url, return an importable song:
// { title, artist, body, capo, tuning, source, source_url }
// `body` is plain monospace text (chords over lyrics / ASCII tab).
export async function fetchTab(url) { ... }
```

Register it in `index.js` by adding the module to the providers list.
The frontend needs no changes: the "Search online" view lists all registered
providers and uses these two endpoints.
