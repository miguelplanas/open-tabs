# Agrupar versiones de la misma canción — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la biblioteca muestre cada canción una sola vez agrupando sus versiones (mismo título+artista), y que al abrir una canción con varias versiones el usuario elija cuál en un popup, con un selector equivalente dentro del reader.

**Architecture:** Agrupación en tiempo de visualización por título+artista normalizados (sin tabla de grupos). El tipo de cada versión (`chords`/`tabs`/`lyrics`) se persiste en una columna `songs.kind`, derivada en el servidor al guardar el cuerpo y rellenada una vez para las existentes, de modo que la lista de la biblioteca ya trae lo necesario para etiquetar cada versión sin cargar cuerpos. Un único popup (`versionPickerDialog`) se reutiliza en biblioteca y reader.

**Tech Stack:** Node 22 + Hono + better-sqlite3 (API síncrona), frontend vanilla ES modules con hash routing, sin build step. Spec de referencia: `docs/superpowers/specs/2026-07-05-agrupar-versiones-cancion-design.md`.

## Global Constraints

- Sin build step, sin frameworks, sin TypeScript. ES modules en todo (`.js`).
- Textos de UI en español. Sin guiones largos (em-dash) en prosa ni UI: usar comas, dos puntos, paréntesis.
- Al cambiar assets del frontend cacheados, subir `SHELL_CACHE` en `public/sw.js` (una sola vez, al final).
- better-sqlite3 es síncrono (nada de await en queries). `foreign_keys` está ON.
- Cuerpos de tab en texto plano monospace; nunca convertir de formato.
- No hay framework de tests en el repo. Verificación = scripts Node (`node --input-type=module -e ...`) para funciones puras, y navegador headless Playwright para UI. Playwright ya está instalado en `/home/mplanas/.claude/jobs/88a8c46f/tmp` (usar el binario cacheado `~/.cache/ms-playwright/chromium_headless_shell-1228/.../chrome-headless-shell`). La app se arranca con `PORT=3111 node server/index.js` sobre la BD real `data/opentabs.db`, que ya tiene 8 grupos con múltiples versiones (ej: "El Sitio De Mi Recreo" de Antonio Vega: una tablatura y una de acordes).

## Mapa de ficheros

- `public/js/chords.js` — nuevo export `detectKind(body)` (funciones puras; importable también por el servidor).
- `server/db.js` — columna `kind` (CREATE + ALTER guardada) y backfill único al arrancar.
- `server/songs.js` — derivar `kind` en INSERT/UPDATE con `body`; añadir `kind` y `tuning` a `LIST_COLS`.
- `public/js/ui.js` — helpers `norm`, `groupKey`, `kindLabel`, `versionSubtitle` y el diálogo `versionPickerDialog`.
- `public/js/views/library.js` — colapsar versiones en una fila por grupo; badge "N versiones"; abrir popup si hay varias.
- `public/js/views/reader.js` — buscar versiones hermanas y mostrar un selector que reutiliza `versionPickerDialog`.
- `public/css/app.css` — estilo mínimo del pill de versión en el reader (lo demás reutiliza `.picker-*` y `.badge`).
- `public/sw.js` — subir `SHELL_CACHE` (v10 → v11).

---

### Task 1: `detectKind` en chords.js

**Files:**
- Modify: `public/js/chords.js` (añadir export al final, tras `renderBody`)
- Verify: `node --input-type=module -e` (sin framework de tests)

**Interfaces:**
- Consumes: `isTabLine`, `isChordLine` (ya exportados en `public/js/chords.js`).
- Produces: `export function detectKind(body: string): 'chords' | 'tabs' | 'lyrics'`.

- [ ] **Step 1: Escribir el check que falla**

Crear `/home/mplanas/.claude/jobs/88a8c46f/tmp/check-detectkind.mjs`:

```js
import { detectKind } from '/home/mplanas/workspace/personal/open-tabs/public/js/chords.js';
const cases = [
  ['e|--0--2--3--|\nB|--1--1--0--|', 'tabs'],
  ['[Verso]\nC       G      Am\nletra de la cancion aqui', 'chords'],
  ['solo letra sin acordes\notra linea de letra mas', 'lyrics'],
  ['', 'lyrics'],
];
let ok = true;
for (const [body, want] of cases) {
  const got = detectKind(body);
  if (got !== want) { ok = false; console.log('FAIL', JSON.stringify(body).slice(0, 30), '->', got, 'esperaba', want); }
}
console.log(ok ? 'DETECTKIND OK' : 'DETECTKIND FALLA');
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `node /home/mplanas/.claude/jobs/88a8c46f/tmp/check-detectkind.mjs`
Expected: error `The requested module ... does not provide an export named 'detectKind'`.

- [ ] **Step 3: Implementar `detectKind`**

Añadir al final de `public/js/chords.js`:

```js
// Clasifica un cuerpo de tab por su contenido, reutilizando los detectores de
// arriba: mayoría de líneas de tablatura -> 'tabs'; si no, con acordes ->
// 'chords'; si no -> 'lyrics'. Usado para etiquetar versiones de una canción.
export function detectKind(body) {
  let tabs = 0, chords = 0;
  for (const line of String(body).split('\n')) {
    if (!line.trim()) continue;
    if (isTabLine(line)) tabs++;
    else if (isChordLine(line)) chords++;
  }
  if (tabs > 0 && tabs >= chords) return 'tabs';
  if (chords > 0) return 'chords';
  return 'lyrics';
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `node /home/mplanas/.claude/jobs/88a8c46f/tmp/check-detectkind.mjs`
Expected: `DETECTKIND OK`.

- [ ] **Step 5: Commit**

```bash
cd /home/mplanas/workspace/personal/open-tabs
git add public/js/chords.js
git commit -m "Add detectKind: classify a tab body as chords/tabs/lyrics"
```

---

### Task 2: columna `kind` en el servidor (derivación + backfill)

**Files:**
- Modify: `server/db.js` (CREATE TABLE songs; migración/backfill tras el bloque `DROP COLUMN tags`)
- Modify: `server/songs.js` (import de `detectKind`; `LIST_COLS`; POST y PUT)
- Verify: reinicio del servidor + `curl`/`node`

**Interfaces:**
- Consumes: `detectKind` de `../public/js/chords.js` (Task 1).
- Produces: columna `songs.kind`; `GET /api/songs` incluye `kind` y `tuning` por fila; `GET /api/songs/:id` incluye `kind` (ya devuelve `*`).

- [ ] **Step 1: Escribir el check que falla**

Crear `/home/mplanas/.claude/jobs/88a8c46f/tmp/check-kind.mjs`:

```js
const base = 'http://localhost:3111/api';
const list = await (await fetch(base + '/songs')).json();
const withoutKind = list.filter((s) => !('kind' in s));
console.log('filas sin kind en la lista:', withoutKind.length);
const emptyKind = list.filter((s) => !s.kind);
console.log('filas con kind vacio:', emptyKind.length);
const hasTuning = list.length && 'tuning' in list[0];
console.log('lista incluye tuning:', hasTuning);
// POST deriva kind
const created = await (await fetch(base + '/songs', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'ZZ Kind Test', artist: 'ZZ', body: 'e|--0--2--|\nB|--1--1--|' }),
})).json();
console.log('kind derivado en POST:', created.kind, '(esperaba tabs)');
await fetch(base + '/songs/' + created.id, { method: 'DELETE' });
console.log((withoutKind.length === 0 && emptyKind.length === 0 && hasTuning && created.kind === 'tabs') ? 'KIND OK' : 'KIND FALLA');
```

- [ ] **Step 2: Ejecutar contra el servidor actual y ver que falla**

Run:
```bash
kill $(lsof -ti:3111) 2>/dev/null; PORT=3111 nohup node /home/mplanas/workspace/personal/open-tabs/server/index.js >/tmp/ot.log 2>&1 & sleep 1.5
node /home/mplanas/.claude/jobs/88a8c46f/tmp/check-kind.mjs
```
Expected: `KIND FALLA` (la lista no trae `kind` ni `tuning`, y el POST no deriva `kind`).

- [ ] **Step 3: Añadir la columna y el backfill en `server/db.js`**

En el `CREATE TABLE IF NOT EXISTS songs (...)`, añadir la columna tras `tuning`:

```js
    tuning TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
```

Añadir el import al principio del fichero (junto a los otros imports):

```js
import { detectKind } from '../public/js/chords.js';
```

Tras el bloque existente que hace `DROP COLUMN tags`, añadir la migración y el backfill:

```js
// Añadir la columna kind a bases creadas antes de que existiera (no-op en nuevas).
if (!songCols.includes('kind')) {
  db.exec("ALTER TABLE songs ADD COLUMN kind TEXT NOT NULL DEFAULT ''");
}

// Backfill único: derivar kind de las canciones que aún no lo tienen. Corre una
// vez (tras el primer arranque no quedan filas con kind vacio).
const needKind = db.prepare("SELECT id, body FROM songs WHERE kind = ''").all();
if (needKind.length) {
  const upd = db.prepare('UPDATE songs SET kind = ? WHERE id = ?');
  db.transaction(() => {
    for (const s of needKind) upd.run(detectKind(s.body), s.id);
  })();
}
```

- [ ] **Step 4: Derivar `kind` y ampliar `LIST_COLS` en `server/songs.js`**

Import al principio:

```js
import { detectKind } from '../public/js/chords.js';
```

Cambiar `LIST_COLS`:

```js
const LIST_COLS =
  'id, title, artist, capo, tuning, source, updated_at, played_at, kind';
```

En el handler `songs.post('/')`, tras `if (data.title === undefined) ...`, derivar kind antes de construir el INSERT:

```js
  data.kind = detectKind(data.body || '');
```

En el handler `songs.put('/:id')`, tras el chequeo `if (Object.keys(data).length === 0) ...`, derivar kind solo si se actualiza el cuerpo:

```js
  if (data.body !== undefined) data.kind = detectKind(data.body);
```

(No tocar `songs.post('/:id/played')`: no escribe `body`, así que no recalcula.)

- [ ] **Step 5: Reiniciar y ver que pasa**

Run:
```bash
kill $(lsof -ti:3111) 2>/dev/null; PORT=3111 nohup node /home/mplanas/workspace/personal/open-tabs/server/index.js >/tmp/ot.log 2>&1 & sleep 1.5
node /home/mplanas/.claude/jobs/88a8c46f/tmp/check-kind.mjs
```
Expected: `KIND OK`.

- [ ] **Step 6: Commit**

```bash
cd /home/mplanas/workspace/personal/open-tabs
git add server/db.js server/songs.js
git commit -m "Store derived kind per song and expose it in the list API"
```

---

### Task 3: helpers y `versionPickerDialog` en ui.js

**Files:**
- Modify: `public/js/ui.js` (añadir helpers y el diálogo; ya importa `h`, `escapeHtml` de `./app.js`)
- Verify: se ejercita en Task 4 (biblioteca) vía Playwright; aquí solo comprobación de sintaxis/carga.

**Interfaces:**
- Consumes: `h`, `escapeHtml` (ya importados en `ui.js`).
- Produces:
  - `export const norm: (s: string) => string`
  - `export const groupKey: (song: {title,artist}) => string`
  - `export function kindLabel(kind: string): string`
  - `export function versionSubtitle(v: {kind,capo,tuning}): string`
  - `export function versionPickerDialog({ title, artist, versions, currentId }): void`
    donde `versions` es un array de filas con `{ id, kind, capo, tuning }`.

- [ ] **Step 1: Añadir helpers y el diálogo a `public/js/ui.js`**

Al final del fichero:

```js
// Misma normalización que norm() en server/db.js: sin acentos, minúsculas.
export const norm = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Clave de agrupación de versiones de una misma canción.
export const groupKey = (song) => norm(song.title) + '|' + norm(song.artist);

const KIND_LABEL = { tabs: 'Tablatura', chords: 'Acordes', lyrics: 'Letra' };
export const kindLabel = (kind) => KIND_LABEL[kind] || 'Acordes';

// Subtítulo de una versión: "Acordes · capo 2 · Drop D".
export function versionSubtitle(v) {
  const parts = [kindLabel(v.kind)];
  if (v.capo) parts.push('capo ' + v.capo);
  if (v.tuning && v.tuning.toLowerCase() !== 'standard') parts.push(v.tuning);
  return parts.join(' · ');
}

// Popup para elegir entre versiones de una misma canción. Cada fila navega a
// esa versión. Reutilizado por la biblioteca y por el reader.
export function versionPickerDialog({ title, artist, versions, currentId = null }) {
  const overlay = h(`
    <div class="confirm-overlay">
      <div class="confirm-box picker" role="dialog" aria-modal="true">
        <p>Elige versión<br><strong>${escapeHtml(title)}</strong>${
          artist ? `<span class="count"> · ${escapeHtml(artist)}</span>` : ''}</p>
        <ul class="picker-list" id="vp-list"></ul>
        <div class="confirm-actions">
          <button type="button" class="btn" id="vp-cancel">Cancelar</button>
        </div>
      </div>
    </div>`);
  const list = overlay.querySelector('#vp-list');
  for (const v of versions) {
    const current = v.id === currentId;
    const row = h(`
      <li class="picker-row${current ? ' member' : ''}">
        <span class="picker-name">${escapeHtml(versionSubtitle(v))}</span>
        <span class="picker-check">${current ? '✓' : '›'}</span>
      </li>`);
    row.onclick = () => { close(); location.hash = '#/song/' + v.id; };
    list.append(row);
  }
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('show');
    const remove = () => overlay.remove();
    overlay.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#vp-cancel').onclick = close;
}
```

- [ ] **Step 2: Comprobar que el módulo carga sin errores**

Run: `node --input-type=module -e "import('/home/mplanas/workspace/personal/open-tabs/public/js/ui.js').then(m => console.log('ui.js OK', typeof m.versionPickerDialog, typeof m.groupKey, m.kindLabel('tabs'), m.versionSubtitle({kind:'chords',capo:2,tuning:'Standard'})))"`
Expected: `ui.js OK function function Tablatura Acordes · capo 2`.

- [ ] **Step 3: Commit**

```bash
cd /home/mplanas/workspace/personal/open-tabs
git add public/js/ui.js
git commit -m "Add version picker dialog and grouping/label helpers"
```

---

### Task 4: agrupar versiones en la biblioteca

**Files:**
- Modify: `public/js/views/library.js` (import; `render`; `songItem`; contador en `load`)
- Verify: Playwright contra la biblioteca real

**Interfaces:**
- Consumes: `groupKey`, `versionPickerDialog` (Task 3); `kind`/`tuning` en las filas de `GET /api/songs` (Task 2).
- Produces: la biblioteca muestra una fila por grupo.

- [ ] **Step 1: Importar helpers**

En `public/js/views/library.js`, cambiar la línea de import de `../ui.js`:

```js
import { segmentNav, groupKey, versionPickerDialog } from '../ui.js';
```

- [ ] **Step 2: Añadir el agrupador y reescribir `render`**

Añadir esta función auxiliar dentro de `libraryView` (por ejemplo justo antes de `function render()`):

```js
  // Colapsa versiones de la misma canción en grupos, preservando el orden de
  // entrada (el primero es el representante: la versión más reciente).
  function groupVersions(songs) {
    const map = new Map();
    const order = [];
    for (const s of songs) {
      const k = groupKey(s);
      if (!map.has(k)) { map.set(k, []); order.push(k); }
      map.get(k).push(s);
    }
    return order.map((k) => map.get(k));
  }
```

Reemplazar el cuerpo de `render()` por:

```js
  function render() {
    let songs = all;
    const cmp = SORTS[$sort.value].cmp;
    if (cmp) songs = [...songs].sort(cmp);
    const groups = groupVersions(songs);

    if (groups.length === 0) {
      $list.innerHTML = `<li class="empty"><div class="strings"></div>${
        $q.value ? 'No songs match.' : 'Your library is empty.<br>Add a song, or search online to import one.'
      }</li>`;
      return;
    }

    $list.innerHTML = '';
    if (grouped) {
      const byArtist = new Map();
      for (const g of groups) {
        const key = g[0].artist || 'Unknown artist';
        if (!byArtist.has(key)) byArtist.set(key, []);
        byArtist.get(key).push(g);
      }
      for (const artist of [...byArtist.keys()].sort((a, b) => a.localeCompare(b))) {
        $list.append(h(`<li class="group-header">${escapeHtml(artist)}</li>`));
        for (const g of byArtist.get(artist)) $list.append(songItem(g, true));
      }
    } else {
      for (const g of groups) $list.append(songItem(g, false));
    }
  }
```

- [ ] **Step 3: Reescribir `songItem` para grupos**

Reemplazar la función `songItem` al final del fichero por:

```js
function songItem(group, hideArtist) {
  const s = group[0];
  const many = group.length > 1;
  const badges = many
    ? `<span class="badge">${group.length} versiones</span>`
    : `${s.capo ? `<span class="badge">capo ${s.capo}</span>` : ''}${
        s.source ? `<span class="badge">${escapeHtml(s.source)}</span>` : ''}`;
  const li = h(`
    <li><a href="${many ? 'javascript:void 0' : '#/song/' + s.id}">
      <div class="title">${escapeHtml(s.title)}${badges}</div>
      ${hideArtist ? '' : `<div class="meta">${escapeHtml(s.artist || 'Unknown artist')}</div>`}
    </a></li>`);
  if (many) {
    li.querySelector('a').onclick = (e) => {
      e.preventDefault();
      versionPickerDialog({ title: s.title, artist: s.artist, versions: group });
    };
  }
  return li;
}
```

- [ ] **Step 4: Contar grupos en el contador de cabecera**

En `load()`, cambiar el bloque que fija el contador (`const n = all.length;`) por el número de grupos:

```js
      if (!$q.value.trim()) {
        const n = groupVersions(all).length;
        document.getElementById('count').textContent =
          n > 0 ? `· ${n} ${n === 1 ? 'song' : 'songs'}` : '';
      }
```

- [ ] **Step 5: Verificar en el navegador**

Crear `/home/mplanas/.claude/jobs/88a8c46f/tmp/check-library.mjs`:

```js
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
const exe = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
const b = await chromium.launch({ executablePath: exe });
const page = await b.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:3111/#/');
await page.waitForSelector('.songlist li a');
// Buscar "El Sitio De Mi Recreo" (2 versiones)
await page.fill('#q', 'sitio de mi recreo');
await page.waitForTimeout(600);
const badge = await page.locator('.songlist .title .badge', { hasText: 'versiones' }).first();
console.log('badge versiones:', (await badge.count()) ? await badge.innerText() : 'NINGUNO');
await page.locator('.songlist li a').first().click();
await page.waitForSelector('.confirm-box.picker #vp-list .picker-row', { timeout: 5000 });
const rows = await page.locator('#vp-list .picker-row .picker-name').allInnerTexts();
console.log('versiones en popup:', JSON.stringify(rows));
await page.locator('#vp-list .picker-row').first().click();
await page.waitForURL(/#\/song\/\d+/, { timeout: 5000 });
console.log('abrio version:', page.url());
await b.close();
console.log('LIBRARY OK');
```

Run:
```bash
kill $(lsof -ti:3111) 2>/dev/null; PORT=3111 nohup node /home/mplanas/workspace/personal/open-tabs/server/index.js >/tmp/ot.log 2>&1 & sleep 1.5
cd /home/mplanas/.claude/jobs/88a8c46f/tmp && node check-library.mjs
```
Expected: badge "2 versiones", el popup lista dos versiones (una "Tablatura", otra "Acordes · ..."), y al tocar abre `#/song/<id>`. Termina con `LIBRARY OK`.

- [ ] **Step 6: Commit**

```bash
cd /home/mplanas/workspace/personal/open-tabs
git add public/js/views/library.js
git commit -m "Group song versions into one library row with a picker"
```

---

### Task 5: selector de versiones en el reader

**Files:**
- Modify: `public/js/views/reader.js` (import; markup del control; carga de hermanas)
- Modify: `public/css/app.css` (estilo mínimo del pill de versión)
- Verify: Playwright

**Interfaces:**
- Consumes: `versionPickerDialog`, `kindLabel`, `norm` (Task 3); `song.kind` de `GET /api/songs/:id` (Task 2).
- Produces: control de versión en el reader cuando la canción tiene hermanas.

- [ ] **Step 1: Importar helpers en el reader**

En `public/js/views/reader.js`, ampliar el import de `../ui.js`:

```js
import { addToCollectionDialog, versionPickerDialog, kindLabel, norm } from '../ui.js';
```

- [ ] **Step 2: Añadir el control al markup de controles**

En el bloque `<div class="reader-controls">`, añadir el botón como primer hijo, oculto por defecto:

```js
    <div class="reader-controls">
      <button class="btn version-pill" id="version" hidden></button>
      <button class="btn primary icon play" id="play" title="Autoscroll">▶</button>
```

(el resto de `.reader-controls` se mantiene igual)

- [ ] **Step 3: Cargar las versiones hermanas y activar el control**

Cerca del final de `readerView`, tras la línea que hace el ping de `played` (`api(\`/songs/${id}/played\`, ...)`), añadir:

```js
  // Selector de versiones: si esta canción tiene hermanas (mismo título+artista),
  // ofrece saltar entre ellas. Best-effort; la lista ya la cachea el SW.
  api('/songs?q=' + encodeURIComponent(song.title))
    .then((rows) => {
      const versions = rows.filter(
        (v) => norm(v.title) === norm(song.title) && norm(v.artist) === norm(song.artist)
      );
      if (versions.length < 2) return;
      const $v = document.getElementById('version');
      if (!$v) return; // la vista ya cambió
      $v.hidden = false;
      $v.textContent = kindLabel(song.kind) + ' ▾';
      $v.onclick = () =>
        versionPickerDialog({ title: song.title, artist: song.artist, versions, currentId: Number(id) });
    })
    .catch(() => { /* offline u otra vista: ignorar */ });
```

- [ ] **Step 4: Estilo del pill de versión**

En `public/css/app.css`, tras la regla `.reader-controls .btn.play { ... }`, añadir:

```css
.reader-controls .version-pill { font-size: 13px; padding: 8px 12px; min-height: 44px; }
```

- [ ] **Step 5: Verificar en el navegador**

Crear `/home/mplanas/.claude/jobs/88a8c46f/tmp/check-reader-versions.mjs`:

```js
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
const exe = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
const b = await chromium.launch({ executablePath: exe });
const page = await b.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
// Encontrar los ids de las dos versiones de "El Sitio De Mi Recreo"
await page.goto('http://localhost:3111/#/');
const versions = await page.evaluate(async () => {
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const all = await (await fetch('/api/songs?q=sitio de mi recreo')).json();
  return all.filter((s) => norm(s.artist) === 'antonio vega').map((s) => s.id);
});
console.log('ids de versiones:', versions);
await page.goto('http://localhost:3111/#/song/' + versions[0]);
await page.waitForSelector('#body');
await page.waitForTimeout(800);
const pill = page.locator('#version');
console.log('pill visible:', await pill.isVisible(), '| texto:', (await pill.textContent())?.trim());
await pill.click();
await page.waitForSelector('#vp-list .picker-row', { timeout: 5000 });
const otras = page.locator('#vp-list .picker-row').nth(1);
await otras.click();
await page.waitForURL(/#\/song\/\d+/, { timeout: 5000 });
console.log('salto a version:', page.url());
// En una cancion de una sola version, el pill no aparece
await page.goto('http://localhost:3111/#/song/1');
await page.waitForSelector('#body');
await page.waitForTimeout(800);
console.log('pill en cancion unica visible:', await page.locator('#version').isVisible());
await b.close();
console.log('READER OK');
```

Run:
```bash
kill $(lsof -ti:3111) 2>/dev/null; PORT=3111 nohup node /home/mplanas/workspace/personal/open-tabs/server/index.js >/tmp/ot.log 2>&1 & sleep 1.5
cd /home/mplanas/.claude/jobs/88a8c46f/tmp && node check-reader-versions.mjs
```
Expected: `pill visible: true` con texto tipo "Tablatura ▾" o "Acordes ▾"; al tocar y elegir otra, navega a otro `#/song/<id>`; en `#/song/1` (una sola versión) `pill ... visible: false`. Termina `READER OK`.

- [ ] **Step 6: Commit**

```bash
cd /home/mplanas/workspace/personal/open-tabs
git add public/js/views/reader.js public/css/app.css
git commit -m "Reader: switch between versions of the same song"
```

---

### Task 6: subir cache del service worker y verificación end-to-end

**Files:**
- Modify: `public/sw.js` (`SHELL_CACHE` v10 → v11)
- Verify: Playwright (regresión de flujos existentes)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: PWA sirve los assets nuevos; sin regresiones.

- [ ] **Step 1: Subir la versión del cache**

En `public/sw.js`, cambiar la línea `const SHELL_CACHE = 'opentabs-shell-v10';` por:

```js
const SHELL_CACHE = 'opentabs-shell-v11';
```

(no hay ficheros nuevos que añadir a la lista `SHELL`: `detectKind` va en `chords.js` y el diálogo en `ui.js`, ambos ya cacheados)

- [ ] **Step 2: Verificación end-to-end y regresión**

Crear `/home/mplanas/.claude/jobs/88a8c46f/tmp/check-e2e-versions.mjs`:

```js
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
const exe = `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`;
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
// 1) Biblioteca agrupa y el contador cuenta grupos
await page.goto('http://localhost:3111/#/');
await page.waitForSelector('.songlist li a');
const count = await page.locator('#count').innerText();
console.log('contador:', count);
// 2) Abrir desde una colección va directo (sin popup)
await page.goto('http://localhost:3111/#/collections');
await page.waitForSelector('.songlist li a');
await page.locator('.songlist li a').first().click();
await page.waitForSelector('#play, .col-song-main', { timeout: 5000 });
await page.locator('.col-song-main').first().click();
await page.waitForURL(/#\/song\/\d+/, { timeout: 5000 });
console.log('colección abre directo:', !(await page.locator('.confirm-box.picker').count()));
// 3) Regresión: buscar en biblioteca encuentra la canción
await page.goto('http://localhost:3111/#/');
await page.fill('#q', 'wonderwall');
await page.waitForTimeout(600);
console.log('busqueda encuentra:', await page.locator('.songlist li a').count() > 0);
await b.close();
console.log('E2E OK');
```

Run:
```bash
kill $(lsof -ti:3111) 2>/dev/null; PORT=3111 nohup node /home/mplanas/workspace/personal/open-tabs/server/index.js >/tmp/ot.log 2>&1 & sleep 1.5
cd /home/mplanas/.claude/jobs/88a8c46f/tmp && node check-e2e-versions.mjs
```
Expected: contador muestra el número de grupos; abrir desde colección no muestra popup; la búsqueda encuentra "Wonderwall". Termina `E2E OK`.

- [ ] **Step 3: Parar el servidor de pruebas y commit**

```bash
kill $(lsof -ti:3111) 2>/dev/null
cd /home/mplanas/workspace/personal/open-tabs
git add public/sw.js
git commit -m "Bump service worker shell cache for version grouping"
```

---

## Notas de verificación

- Todas las pruebas corren sobre la BD real `data/opentabs.db`. El único dato de prueba que se crea (Task 2, "ZZ Kind Test") se borra en el mismo check. Si algún check deja datos por un fallo, borrarlos por la API (`DELETE /api/songs/:id`).
- Si un `check-*.mjs` no encuentra Playwright, instalar en el dir de trabajo: `cd /home/mplanas/.claude/jobs/88a8c46f/tmp && npm i playwright-core`.
- El servidor de pruebas usa el puerto 3111 para no chocar con la instancia que el usuario pueda tener en el 3000.
