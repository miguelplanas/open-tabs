# OpenTabs

Self-hosted, single-user tab/chords library (personal Ultimate Guitar alternative).
Owner uses it primarily on iPhone as an installed PWA; laptop secondary.

## Workflow (mandatory, no exceptions)

Every change, however small, follows this path:

1. **Never commit on `main`.** Branch `feat/*` or `fix/*` always. `main` is
   protected by a repository ruleset: direct pushes are rejected by the server.
2. Any behaviour change ships with a test. No test, no PR.
3. `npm test` green **before** committing.
4. Explicit `git add <file>`. **Never `git commit -am`**: it stages every
   tracked modified file, not just the one you touched.
5. `gh pr create --fill`.
6. **Do not merge.** Merging is the owner's decision (see Deployment).

Chain shell commands with `&&`. Bash does not stop when a line fails, and a
failed `git switch -c` followed by unchained commands has already caused work
to land on the wrong branch.

Before opening the PR, self-check:

- Did I redraw an icon? Then bump the `?v=` on every icon URL, in
  `index.html`, `manifest.webmanifest` and the `sw.js` SHELL list. The service
  worker cache does not help here: the browser keeps favicons in a separate
  cache keyed by URL, which outlives both a hard refresh and the service
  worker, so the same URL keeps serving the old drawing.
- Did I add a new directory? Then add it to the Dockerfile `COPY` list
  (see Repo traps).
- Does the PR do exactly one thing?

## Deployment

`main` -> CI -> Tailscale -> Dokploy -> Docker Swarm on the `prod` VM.

**Merging is deploying.** There is no staging environment. A merged PR is live
in about two minutes. This is why step 6 above exists.

CI (`.github/workflows/ci.yml`) runs `test` on pull requests and on pushes to
`main`; the ruleset requires it to pass before a merge is allowed. On pushes
to `main` only, a second `deploy` job then calls Dokploy's deploy hook.

**A webhook from GitHub cannot work here, so do not try to reinstate one.**
`prod` answers on a Tailscale name that resolves into `100.64.0.0/10`, which
is not routable from the internet, so GitHub's delivery attempts fail with
"failed to connect to host". The deploy job gets around this by joining the
tailnet as an ephemeral node tagged `tag:ci` and calling the hook from inside
the network, rather than by exposing `prod`. It needs three repository
secrets, and succeeds without deploying while any of them is missing:
`TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` (a Tailscale OAuth client that can
mint `tag:ci` keys) and `DOKPLOY_DEPLOY_URL`. The tailnet ACL has to let
`tag:ci` reach `prod:3000`.

**Dokploy answers 200 even when it refuses to deploy.** It reads the branch
out of the webhook payload, so the call has to reproduce a push event
(`X-GitHub-Event: push` and a body carrying `ref`); an empty POST earns a
`{"message":"Branch Not Match"}` with a 200 attached. The status code is
therefore worthless as a signal and the deploy step parses the body instead.
Keep it that way: the failure mode this guards against is a green pipeline
that deployed nothing.

**Ship through GitHub, never straight at `prod`.** This is a working rule, not
a network fact: `devbox` and `prod` share a tailnet, and MagicDNS resolves
`prod` from `devbox`, so nothing stops you reaching it by hand. Do not. The
point of routing everything through `main` is that what runs in production is
always a reviewed commit somebody can find again, rather than whatever was on
a laptop that afternoon. For the same reason, never edit files inside the
running container: the next deploy discards them and the change leaves no
trace.

## Architecture

- Node + Hono + better-sqlite3, no build step anywhere. The Node version in
  the Dockerfile is authoritative; CI and local nvm must match it.
- `server/` is the JSON API (`/api/...`), `public/` is a vanilla-JS SPA (hash
  routing) served statically. One exception: `/sw.js` has its own route, which
  substitutes `__SHELL_VERSION__` with a hash of everything under `public/`
  before serving it, so a deploy that changed an asset purges the old service
  worker cache on its own. Nothing to bump by hand; that route has to stay
  registered ahead of the `serveStatic` catch-all or the placeholder ships to
  the browser verbatim.
- SQLite file lives at `OPENTABS_DB` (default `data/opentabs.db`). Tables:
  `songs`, `collections`, the `collection_songs` join table (ordered
  many-to-many; `foreign_keys` pragma is ON for cascade deletes), and
  `sessions` for auth. Collections (folders/albums/setlists) live in
  `server/collections.js` under `/api/collections`.
- Auth: single password via `OPENTABS_PASSWORD` env var; login mints a random
  token stored in the `sessions` table and set as an httpOnly cookie
  (`server/auth.js`). Auth is disabled when the var is unset (local dev and
  CI). Never make auth conditional on anything other than that variable, and
  never log or echo the token.
- Tab sources (online search/import) are pluggable providers in
  `server/sources/`; contract documented in `server/sources/provider.md`. The
  frontend discovers providers via `GET /api/sources`, so new providers need
  no frontend changes.
- `songs.kind` (`chords`/`tabs`/`lyrics`) is derived from the body by
  `detectKind()` on every write in `server/songs.js`, never accepted from the
  client. The library groups rows with the same normalized title + artist into
  one song with several versions; the grouping is computed at render time and
  never stored.
- `scripts/` holds one-off account tools that are not part of the app:
  `import-ug.js` restores an Ultimate Guitar account (lists and playlists
  become collections), `ug-probe.js` inspects a logged-in UG page, `ug-lib.js`
  is their shared fetch plumbing. They read a session cookie from
  `~/.ug-cookie` and never take it as a command-line argument. Never print,
  copy or commit the contents of that file.

## Data: read this before touching anything

- Production data is a SQLite file inside a Docker volume on `prod`, about 600
  songs. **There is no automated backup yet.**
- `data/` is gitignored. The local copy is disposable and is never the source
  of truth.
- The configurable DB path
  (`resolve(ROOT, process.env.OPENTABS_DB || 'data/opentabs.db')`) is what
  lets the tests write to `/tmp`. Do not change that resolution logic.
- A `.db` file plus its `-wal` and `-shm` sidecars are one indivisible set.
  Replacing one means deleting the other two.
- Copying a live `.db` while WAL is active loses data. Use
  `scripts/backup-db.js` (`VACUUM INTO`) instead.
- Schema migrations and changes to write paths are high risk. Propose them and
  wait for approval; do not carry them out on your own initiative.

## Repo traps

- **The Dockerfile uses a `COPY` allowlist.** Any new directory has to be
  added by hand or it never reaches the image, even though it is in GitHub.
  This already happened with `scripts/`.
- Tests are deliberately **not** in the image. Do not add `test/` to the
  `COPY` list.
- The container runs as root, so files in the volume are owned by `0:0`.
- The Swarm service name carries a suffix that changes on every deploy. Never
  hardcode it: `CID=$(docker ps -q -f name=opentabs)`, and check it is not
  empty before using it.
- The naming inconsistency is intentional and must not be "fixed":
  repo `open-tabs`, env var `OPENTABS_DB` (POSIX forbids hyphens), file
  `data/opentabs.db`, Swarm service `opentabs-opentabs-...`.

## Conventions

- Tab bodies are plain monospace text (chords over lyrics, ASCII tablature).
  Never convert to ChordPro or other formats; chord lines are detected at
  render time in `public/js/chords.js`.
- Frontend views live in `public/js/views/*.js`, one exported async function
  per view; return a teardown function if the view registers global listeners
  or timers.
- No frameworks, no bundlers, no TypeScript. ES modules everywhere.
- No new dependencies unless explicitly requested. Tests use `node:test` and
  `node:assert` only.
- Small, scoped changes. One PR, one thing.

## Commands

- `npm start` to run, `npm run dev` for watch mode. Port via `PORT`
  (default 3000, already busy on `devbox` by other dev servers).
- `npm test` runs the suite in `test/`: unit tests over pure logic (chord
  detection/transpose, chord-diagram shapes, entity decoding) plus a smoke
  test that boots the app against `OPENTABS_DB=/tmp/test.db` and exercises the
  API. New behaviour goes in the matching file, not in a new structure.
- `docker compose up --build` for the container; data persists in `./data`.

## User preferences

- No em-dashes in any prose or docs (use commas, colons, parentheses).
- The owner is learning Claude Code workflows: explain what you are doing when
  using plan mode, /goal, /code-review, /verify.
- The owner reviews PRs from an iPhone. Keep PR titles descriptive and diffs
  small enough to scan: a nine-file diff for a one-line request is a red flag.