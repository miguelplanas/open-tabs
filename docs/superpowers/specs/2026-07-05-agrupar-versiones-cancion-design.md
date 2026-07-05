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
- **Etiqueta de cada versión en el popup:** tipo detectado + capo/afinación
  (ej: "Acordes · capo 2", "Tablatura").

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

### 1. Detección de tipo de versión (`public/js/chords.js`)

Nuevo export `detectKind(body)` que reutiliza los detectores existentes
`isTabLine` e `isChordLine`:

- Recorre las líneas no vacías y cuenta `tabLines` y `chordLines`.
- Si `tabLines > 0` y `tabLines >= chordLines` → `'tabs'`.
- Si no, si `chordLines > 0` → `'chords'`.
- Si no → `'lyrics'`.

Etiqueta para UI (en el frontend, textos en español): `tabs` → "Tablatura",
`chords` → "Acordes", `lyrics` → "Letra".

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

### 3. Popup de versiones (`public/js/ui.js`)

Nueva función `versionPickerDialog(group)` siguiendo el patrón de overlay ya
existente (`promptDialog`, `addToCollectionDialog`, `confirmDialog`):

- Cabecera: "Elige versión" + título/artista.
- Una fila por versión, ordenadas como vienen (representante primero). Cada fila
  muestra la etiqueta de tipo detectado (`detectKind` sobre `body`) y, si los
  hay, `· capo N` y `· afinación` (misma lógica que el subtítulo del reader:
  omitir afinación "standard").
- Nota: los cuerpos (`body`) hacen falta para detectar el tipo. La lista de la
  biblioteca (`GET /api/songs`) no incluye `body`. Para no cargar todos los
  cuerpos por adelantado, el popup pide las versiones del grupo con `body`
  cuando se abre (varias `GET /api/songs/:id`, que además el service worker ya
  cachea). El detalle exacto de fetch se decide en el plan.
- Al tocar una versión → `location.hash = '#/song/' + id`, cerrar popup.
- Cerrar con Escape, tap fuera, o botón. Devuelve una función de teardown si
  registra listeners globales, según convención del proyecto.

### 4. Colecciones (`public/js/views/collection.js`) — sin cambios

Una colección apunta a `song_id` concretos (una versión fija). Abrir una canción
desde una colección o desde "reproducir" va directa a esa versión, sin popup. Es
lo coherente: la colección ya eligió versión. No se toca.

## Fuera de alcance (YAGNI)

- UI para unir/separar grupos a mano, o agrupar títulos distintos.
- "Versión preferida" fija (el usuario quiere popup siempre que haya varias).
- Botón para saltar de versión dentro del reader sin volver atrás (ofrecido y no
  solicitado; se puede añadir después).
- Cambios en editor, import/preview, o deduplicación al importar (ya existe el
  aviso de duplicado en la preview).

## Datos y estado

- Sin cambios de esquema. Sin migración.
- El agrupado es puro cálculo de vista; no se guarda ninguna identidad de grupo.

## Verificación

Sin suite de tests en el repo; se verifica ejecutando la app (`npm start`) y con
navegador headless (Playwright ya disponible), usando la biblioteca real que ya
tiene los 8 grupos con múltiples versiones (ej: "El Sitio De Mi Recreo" de
Antonio Vega tiene una de tablatura y otra de acordes):

1. La biblioteca muestra cada grupo una sola vez, con badge "N versiones"; el
   contador cuenta grupos; sort y agrupar-por-artista siguen bien.
2. Tocar una canción de una sola versión abre el reader directo.
3. Tocar "El Sitio De Mi Recreo" abre el popup con dos versiones etiquetadas
   "Tablatura" y "Acordes · ..."; elegir una abre esa versión.
4. `detectKind` clasifica correctamente cuerpos de tablatura, de acordes y de
   solo letra (comprobación unitaria rápida con Node).
5. Abrir una canción desde una colección va directa a su versión, sin popup.
6. Regresión: buscar en la biblioteca sigue encontrando la canción (una entrada).
