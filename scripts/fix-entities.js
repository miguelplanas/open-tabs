// Decode the HTML entities that reached the library before the Ultimate Guitar
// provider learned to decode them (see cleanBody there).
//
//   node scripts/fix-entities.js        # dry run: show what would change
//   node scripts/fix-entities.js --go   # rewrite the affected bodies
//
// This is not only cosmetic. "&iquest;" occupies eight columns and stands for
// one character, so every chord above the rest of that line was pointing at the
// wrong syllable. Decoding shortens the lyric back to its real width and the
// alignment comes back with it.
//
// updated_at is deliberately left alone: it carries the library's display order
// (see scripts/import-ug.js), and repairing text is not a reason to reshuffle
// 103 songs to the top of the list. kind is recomputed because the body changed.

import { db } from '../server/db.js';
import { cleanBody } from '../server/sources/ultimate-guitar.js';
import { detectKind } from '../public/js/chords.js';

const GO = process.argv.includes('--go');
const ENTITY = /&(?:[a-zA-Z]{2,10}|#\d{2,5}|#x[0-9a-fA-F]{2,5});/;

const rows = db.prepare('SELECT id, title, artist, body, kind FROM songs').all();
const work = [];
for (const s of rows) {
  if (!ENTITY.test(s.body)) continue;
  const body = cleanBody(s.body);
  if (body === s.body) continue; // entity-looking text we do not know: leave it
  work.push({ ...s, body, newKind: detectKind(body) });
}

console.log(`songs: ${rows.length}, with entities to decode: ${work.length}`);
if (work.length === 0) process.exit(0);

const shrink = work.reduce((n, w) => n + (rows.find((r) => r.id === w.id).body.length - w.body.length), 0);
console.log(`characters removed in total: ${shrink}`);
const kindChanges = work.filter((w) => w.kind !== w.newKind);
if (kindChanges.length) console.log(`kind recomputed for ${kindChanges.length} of them`);

console.log('\nexamples:');
for (const w of work.slice(0, 5)) {
  const before = rows.find((r) => r.id === w.id).body;
  const line = before.split('\n').find((l) => ENTITY.test(l)) ?? '';
  console.log(`  ${w.title} - ${w.artist}`);
  console.log(`    before: ${line.trim().slice(0, 72)}`);
  console.log(`    after:  ${cleanBody(line).trim().slice(0, 72)}`);
}

if (!GO) {
  console.log('\nDry run. Re-run with --go to apply.');
  process.exit(0);
}

const update = db.prepare('UPDATE songs SET body = ?, kind = ? WHERE id = ?');
db.transaction(() => {
  for (const w of work) update.run(w.body, w.newKind, w.id);
})();

const left = db.prepare('SELECT COUNT(*) AS n FROM songs WHERE body LIKE ?').get('%&%');
console.log(`\nrewrote ${work.length} songs. Songs still containing an ampersand: ${left.n} (literal ones are fine).`);
