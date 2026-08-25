# OpenTabs

Self-hosted, single-user tab/chords library (personal Ultimate Guitar alternative).
Owner uses it primarily on iPhone as an installed PWA; laptop secondary.

## Architecture

- Node 22 + Hono + better-sqlite3, no build step anywhere.
- `server/` is the JSON API (`/api/...`), `public/` is a vanilla-JS SPA (hash routing) served statically.
- SQLite file lives at `OPENTABS_DB` (default `data/opentabs.db`). Tables: `songs`, `collections`, the `collection_songs` join table (ordered many-to-many; `foreign_keys` pragma is ON for cascade deletes), and `sessions` for auth. Collections (folders/albums/setlists) live in `server/collections.js` under `/api/collections`.
- Auth: single password via `OPENTABS_PASSWORD` env var; login mints a random token stored in the `sessions` table and set as an httpOnly cookie (`server/auth.js`). Auth is disabled when the var is unset (local dev).
- Tab sources (online search/import) are pluggable providers in `server/sources/`; contract documented in `server/sources/provider.md`. The frontend discovers providers via `GET /api/sources`, so new providers need no frontend changes.
- `songs.kind` (`chords`/`tabs`/`lyrics`) is derived from the body by `detectKind()` on every write in `server/songs.js`, never accepted from the client. The library groups rows with the same normalized title + artist into one song with several versions; the grouping is computed at render time and never stored.
- `scripts/` holds one-off account tools that are not part of the app: `import-ug.js` restores an Ultimate Guitar account (lists and playlists become collections), `ug-probe.js` inspects a logged-in UG page, `ug-lib.js` is their shared fetch plumbing. They read a session cookie from `~/.ug-cookie` and never take it as a command-line argument.

## Conventions

- Tab bodies are plain monospace text (chords over lyrics, ASCII tablature). Never convert to ChordPro or other formats; chord lines are detected at render time in `public/js/chords.js`.
- Frontend views live in `public/js/views/*.js`, one exported async function per view; return a teardown function if the view registers global listeners or timers.
- No frameworks, no bundlers, no TypeScript. ES modules everywhere.
- When bumping cached frontend assets, update the cache names in `public/sw.js`.

## Commands

- `npm start` to run, `npm run dev` for watch mode. Port via `PORT` (default 3000).
- `npm test` runs the unit suite (Node's built-in `node:test`, no deps) over the pure logic in `test/`: chord detection/transpose, chord-diagram shapes, entity decoding.
- `docker compose up --build` for the container; data persists in `./data`.

## User preferences

- No em-dashes in any prose or docs (use commas, colons, parentheses).
- The owner is learning Claude Code workflows: explain what you are doing when using plan mode, /goal, /code-review, /verify.
