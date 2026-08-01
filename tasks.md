# Tasks

## Done

- [x] **Keep the screen on for the whole song.** The wake lock used to be tied
  to autoscroll, so reaching the last line released it and the phone locked
  mid-song. It is now held for as long as the reader is open (re-acquired on
  every visibility change and on touch, released after 20 idle minutes with
  nothing playing). `public/js/views/reader.js`.

- [x] **Readable font on wide tabs.** ASCII staves are grouped into one
  `.tabblock` per stave and scroll sideways on their own, so they no longer
  drag the whole song down to fit their longest line. The font fit now targets
  the 95th percentile of chord/lyric line widths and never shrinks below 11px.
  `public/js/chords.js` (`renderBody`, `fitChars`), `reader.js`, `app.css`.

- [x] **Keep your place in the library.** Scroll position is remembered per
  route for the list views (library, collections, a collection, online search)
  and restored on the way back; the reader always opens on the first line.
  `public/js/app.js`.

- [x] **Quieter reader controls.** The full-width bottom bar is gone. A corner
  dock holds play/pause plus a speed nudge and fades back while autoscroll
  runs; transpose, font size, the speed slider, "add to collection" and "edit"
  moved into a song tools sheet behind `⋯` in the top bar. The active
  transpose shows in the subtitle so a song never silently reads in the wrong
  key. `reader.js`, `ui.js` (`openSheet`), `app.css`.

- [x] **Restore the Ultimate Guitar library.** 595 tabs imported with their
  order, dates and structure: 3 lists (favourites, personal, contributions)
  and 8 playlists became 11 collections with explicit positions.
  `scripts/import-ug.js`, `ug-lib.js`, `ug-probe.js`.

- [x] **Several versions of the same song.** Rows sharing a normalized
  title + artist collapse into one library entry with an "N versions" badge;
  tapping opens a picker labelled by kind, capo and tuning, and the reader can
  switch version from its tools sheet. Kind (`chords`/`tabs`/`lyrics`) is
  derived server-side on every write. 51 such groups in the restored library.
  Follows `docs/superpowers/specs/2026-07-05-agrupar-versiones-cancion-design.md`,
  except the labels are in English to match the rest of the interface.

- [x] **No source badge in the song list.** Provenance is still stored, it is
  just not shown. `public/js/views/library.js`.

## Next up

- [ ] Backups: nightly `sqlite3 .backup` (or `better-sqlite3`'s `db.backup()`)
  to a dated file, with retention. Now that the library is real data again,
  this is the most urgent item on the list.
- [ ] `/healthz` endpoint plus a systemd unit for the Proxmox LXC.
- [ ] Metronome / tap tempo, and deriving autoscroll speed from BPM.
- [ ] Full-text search over tab bodies (SQLite FTS5), not just title/artist.
- [ ] A tuner (getUserMedia plus autocorrelation), the one Ultimate Guitar
  feature still worth having.
