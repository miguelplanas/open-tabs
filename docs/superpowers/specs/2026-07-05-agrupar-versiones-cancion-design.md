# Diseño: agrupar versiones de la misma canción

Fecha: 2026-07-05

## Contexto

Tras importar ~550 canciones de Ultimate Guitar, la biblioteca contiene filas
`songs` distintas que son en realidad la misma canción en varias versiones
(mismo título y artista, distinto `tab_id` / contenido; por ejemplo una versión
de acordes y otra de tablatura). Hoy hay 8 grupos así (16 canciones), y
aparecerán más al seguir importando.

El objetivo: que en la biblioteca cada canción aparezca una sola vez, y que al
tocarla, si tiene varias versiones, el usuario elija cuál abrir mediante un
popup. Cada versión puede ser de tipo distinto (acordes vs tablatura).

## Decisiones tomadas (con el usuario)

- **Criterio de agrupación:** automático por título + artista normalizados
  (ignorando mayúsculas y acentos). Sin agrupación manual.
- **Al abrir:** una sola versión abre el reader directamente; varias versiones
  muestran un popup para elegir.
- **Etiqueta de cada versión en el popup:** tipo (acordes / tablatura / letra)
  + capo/afinación (ej: "Acordes · capo 2", "Tablatura").
- **El tipo se guarda con la canción** (columna `kind`), no se detecta solo al
  mostrar. Se deriva en el servidor al guardar el cuerpo, así siempre es
  correcto y consistente.
- **Selector de versiones en el reader:** estando dentro de una versión, se
  puede saltar a otra versión del mismo grupo sin volver atrás.

## Enfoque: agrupación en tiempo de visualización (sin cambios de esquema)

Cada versión sigue siendo su propia fila en `songs`. La agrupación se calcula al
renderizar, no se persiste. Ventajas: cero migraciones, reversible, y se
recalcula sola al editar títulos, importar o borrar. Descartada la alternativa
de fusionar en una tabla de versiones por requerir migración y reescritura de
reader/editor sin aportar nada que el usuario necesite (YAGNI).

Normalización (ya existe como `norm()` en `server/db.js` y se replica en
frontend): `NFD` + quitar diacríticos + `trim` + `toLowerCase`. Clave de grupo =
`norm(title) + '|' + norm(artist)`.

## Componentes

### 1. Detección y almacenamiento del tipo

**Detección (`public/js/chords.js`).** Nuevo export `detectKind(body)` que
reutiliza los detectores existentes `isTabLine` e `isChordLine`:

- Recorre las líneas no vacías y cuenta `tabLines` y `chordLines`.
- Si `tabLines > 0` y `tabLines >= chordLines` → `'tabs'`.
- Si no, si `chordLines > 0` → `'chords'`.
- Si no → `'lyrics'`.

`chords.js` son funciones puras sin dependencias del DOM en la carga del módulo,
así que el servidor puede importarlo por ruta de fichero
(`import { detectKind } from '../public/js/chords.js'`), sin duplicar la lógica.

**Almacenamiento (`server/db.js`, `server/songs.js`).**

- Nueva columna `songs.kind TEXT NOT NULL DEFAULT ''` (valores `'chords'`,
  `'tabs'`, `'lyrics'`). En `db.js`: añadir a `CREATE TABLE` y una `ALTER TABLE`
  guardada para bases existentes (mismo patrón que el `DROP COLUMN tags`).
- **Única fuente de verdad = servidor.** En `songs.js`, en cada INSERT/UPDATE
  que escriba `body`, recalcular `kind = detectKind(body)` y guardarlo. El
  cliente no manda `kind`; se deriva siempre en el servidor, así ninguna vía de
  guardado puede dejarlo inconsistente. (El endpoint `/played` no toca `body`,
  así que no recalcula.)
- **Backfill una vez** en `db.js` al arrancar: `UPDATE` de las filas con
  `kind = ''` calculando `detectKind` sobre su `body`. Para las ~550 canciones
  actuales corre una vez; en arranques siguientes no encuentra ninguna.

Etiqueta para UI (frontend, en español): `tabs` → "Tablatura", `chords` →
"Acordes", `lyrics` → "Letra".

### 2. Biblioteca (`public/js/views/library.js`)

- Tras cargar `all` (todas las canciones, ya ordenadas por el servidor), agrupar
  por clave de grupo preservando el orden de aparición. El primer elemento de
  cada grupo es el **representante** (la versión tocada/actualizada más
  reciente, porque el servidor ya ordena por `played_at`/`updated_at`).
- El sort actual (Recent/Title/Artist) y el "agrupar por artista" se aplican
  sobre los representantes de grupo, no sobre canciones sueltas.
- Cada fila muestra título + artista del representante. Si el grupo tiene >1
  versión, en vez del badge de capo se muestra un badge "N versiones". Si tiene
  1, se comporta igual que hoy (incluido el badge de capo/fuente).
- El contador de cabecera cuenta grupos (canciones únicas), no filas.
- La búsqueda (`?q=`) sigue igual en el servidor; el agrupado se aplica sobre el
  resultado filtrado.
- Al tocar una fila:
  - grupo de 1 versión → `location.hash = '#/song/' + id` (como ahora).
  - grupo de >1 → abre el popup de versiones (componente nuevo). Ya no navega
    con un `<a href>` directo; la fila pasa a manejar el click en JS para poder
    decidir.

Como `kind` queda en la BD, se añade a `LIST_COLS` en `server/songs.js` (junto
con `tuning`, que hoy no está en la lista) para que la lista de la biblioteca
traiga ya todo lo que el popup necesita para etiquetar (`kind`, `capo`,
`tuning`). Así el popup no carga cuerpos.

### 3. Popup de versiones (`public/js/ui.js`)

Nueva función `versionPickerDialog(group)` siguiendo el patrón de overlay ya
existente (`promptDialog`, `addToCollectionDialog`, `confirmDialog`):

- Cabecera: "Elige versión" + título/artista.
- Una fila por versión, ordenadas como vienen (representante primero). Cada fila
  muestra la etiqueta de tipo desde `kind` y, si los hay, `· capo N` y
  `· afinación` (misma lógica que el subtítulo del reader: omitir afinación
  "standard"). Todo sale de los datos de lista; sin fetch de cuerpos.
- Al tocar una versión → `location.hash = '#/song/' + id`, cerrar popup.
- Cerrar con Escape, tap fuera, o botón. Devuelve una función de teardown si
  registra listeners globales, según convención del proyecto.
- Reutilizable: lo usan tanto la biblioteca (al tocar) como el reader (selector
  de versiones).

### 4. Selector de versiones en el reader (`public/js/views/reader.js`)

Dentro de una versión se puede saltar a otra del mismo grupo sin volver atrás.

- Al cargar la canción, el reader busca sus hermanas: `GET /api/songs?q=<title>`
  y filtra por `norm(title) == norm(song.title) && norm(artist) ==
  norm(song.artist)`. Es una lista ya cacheada por el service worker.
- Si el grupo tiene >1 versión, el reader muestra un control (en la barra de
  controles o junto al título) etiquetado con el tipo de la versión actual
  (ej: "Acordes ▾"). Si solo hay una, no aparece.
- Tocar el control abre `versionPickerDialog` con las hermanas; elegir otra
  navega a `#/song/:id`. La versión actual se marca como seleccionada.
- Interacción con setlist: si se estaba en modo colección/"reproducir",
  cambiar de versión sale del setlist y muestra la versión elegida como canción
  normal (la otra versión no está en los `ids` del setlist). Es aceptable y
  mantiene el código simple.

### 5. Colecciones (`public/js/views/collection.js`) — sin cambios

Una colección apunta a `song_id` concretos (una versión fija). Abrir una canción
desde una colección o desde "reproducir" va directa a esa versión, sin popup. Es
lo coherente: la colección ya eligió versión. No se toca.

## Fuera de alcance (YAGNI)

- UI para unir/separar grupos a mano, o agrupar títulos distintos.
- "Versión preferida" fija (el usuario quiere popup siempre que haya varias).
- Cambios en editor, import/preview, o deduplicación al importar (ya existe el
  aviso de duplicado en la preview). Nota: el editor y la preview no mandan
  `kind`; el servidor lo deriva al guardar, así que no requieren cambios.

## Datos y estado

- Un cambio de esquema: columna `songs.kind` (con `ALTER TABLE` guardada para
  bases existentes y backfill único al arrancar). Sin tablas nuevas.
- El agrupado sigue siendo cálculo de vista; no se guarda identidad de grupo.
- El bump de assets cacheados del frontend exige actualizar `SHELL_CACHE` en
  `public/sw.js` (convención del proyecto).

## Verificación

Sin suite de tests en el repo; se verifica ejecutando la app (`npm start`) y con
navegador headless (Playwright ya disponible), usando la biblioteca real que ya
tiene los 8 grupos con múltiples versiones (ej: "El Sitio De Mi Recreo" de
Antonio Vega tiene una de tablatura y otra de acordes):

1. `detectKind` clasifica correctamente cuerpos de tablatura, de acordes y de
   solo letra (comprobación unitaria rápida con Node).
2. Tras arrancar, todas las canciones tienen `kind` no vacío (backfill), y al
   guardar una edición del cuerpo el `kind` se recalcula.
3. La biblioteca muestra cada grupo una sola vez, con badge "N versiones"; el
   contador cuenta grupos; sort y agrupar-por-artista siguen bien.
4. Tocar una canción de una sola versión abre el reader directo.
5. Tocar "El Sitio De Mi Recreo" abre el popup con dos versiones etiquetadas
   "Tablatura" y "Acordes · ..."; elegir una abre esa versión.
6. En el reader de una canción con varias versiones aparece el selector; saltar
   a otra versión abre esa otra; en una canción de una sola versión no aparece.
7. Abrir una canción desde una colección va directa a su versión, sin popup.
8. Regresión: buscar en la biblioteca sigue encontrando la canción (una entrada).
