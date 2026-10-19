---
name: OpenTabs
description: Base visual común de todo lo que hace Miguel. Tres voces, seis tamaños, tinta sobre blanco roto.
colors:
  bg: "#F7F7F5"
  surface: "#FFFFFF"
  sunken: "#EEEEEA"
  ink: "#131313"
  ink-2: "#5E5E5A"
  line: "rgb(19 19 19 / 0.12)"
  danger: "#B3261E"
  ok: "#1E7A3C"
  bg-dark: "#10100F"
  ink-dark: "#EBEBE6"
typography:
  brand-l: { fontFamily: "Host Grotesk", fontWeight: 800, fontSize: "clamp(17px, 1.7vw, 22px)", lineHeight: 1, letterSpacing: "0.04em", textTransform: uppercase }
  brand-s: { fontFamily: "Host Grotesk", fontWeight: 800, fontSize: "clamp(13px, 1.1vw, 14.5px)", lineHeight: 1, letterSpacing: "0.04em", textTransform: uppercase }
  text-xl: { fontFamily: "Host Grotesk", fontWeight: 500, fontSize: "clamp(36px, 5vw, 56px)", lineHeight: 1.05, letterSpacing: "-0.03em" }
  text-l: { fontFamily: "Host Grotesk", fontWeight: 400, fontSize: "clamp(26px, 3vw, 38px)", lineHeight: 1.15, letterSpacing: "-0.02em" }
  text-m: { fontFamily: "Host Grotesk", fontWeight: 400, fontSize: "clamp(17px, 1.4vw, 19px)", lineHeight: 1.55 }
  text-s: { fontFamily: "Host Grotesk", fontWeight: 400, fontSize: "15px", lineHeight: 1.5 }
  tech-m: { fontFamily: "IBM Plex Mono", fontWeight: 500, fontSize: "15px", lineHeight: 1.5 }
  tech-s: { fontFamily: "IBM Plex Mono", fontWeight: 400, fontSize: "13px", lineHeight: 1.55 }
rounded:
  control: "8px"
  surface: "14px"
spacing: { s1: "4px", s2: "8px", s3: "12px", s4: "16px", s6: "24px", s8: "32px", s12: "48px" }
components:
  button-primary: { backgroundColor: "{colors.ink}", textColor: "{colors.bg}", rounded: "{rounded.control}", height: "44px", padding: "0 16px" }
  button: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.control}", height: "44px", padding: "0 16px" }
  field: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.control}", height: "44px", padding: "0 12px" }
  sheet: { backgroundColor: "{colors.surface}", rounded: "{rounded.surface}", padding: "24px" }
---

# Diseño

Un solo estilo para todo lo que hace Miguel: apps, portfolio, apuntes. La fuente de verdad es `docs/estilo.md` del repo `homelab`; este documento es cómo se aplica en una app. La base vive en `public/css/base.css` y **no se edita en cada app**: lo propio va en `public/css/app.css`.

Herramienta, no escaparate: clara, sobria, rápida, con el aspecto de algo hecho a mano por alguien con criterio.

Ficha de esta app (rellénala al crearla):

- Rasgo propio: las seis cuerdas (`.strings`, separador con seis líneas, la más gruesa abajo, como en el mástil) y el riel de trastes (`.fret-rail`, puntos de los trastes 3-5-7-9 y la octava en el 12 en el borde derecho del lector; el punto marca por dónde vas).
- Sin color de acento ni `--hue`: lo activo (pestaña, segmento, chip, botón principal) es tinta y peso 500.
- Lo demás propio de la app: el cuerpo de la tab va en IBM Plex Mono (ahí la alineación es el significado) y los acordes en azul (`--chord`), el único color con significado de la app, con contraste AA en claro y en oscuro. El modo oscuro es el del escenario: tiene que leerse bien con poca luz.
- Decisión de los acordes (19-10-2026): se probó a dejarlos en tinta 500 sin color (capturas en el iPhone, claro y oscuro). No basta: Plex Mono solo tiene 400 y 500, y a la distancia del atril el acorde se confunde con la letra, con las secciones (`[Intro]`, también 500) y con anotaciones como `x4`. Se queda un solo azul contenido, que significa "esto es un acorde"; nada más en la app lleva color.
- Cabeceras de grupo de la biblioteca (letra en A-Z, artista en Artist): voz Tech (`--tech-m`) en `--ink-2` con línea de tinta debajo, para que se lean como etiqueta de sección y no como otra canción. Etiquetas de fila (`capo 3`, `2 versions`) en Tech entre corchetes.

## Overview

- **Lo que comparten todas:** fuentes, escala, colores, espaciado, dos radios, listas en vez de tarjetas, claro y oscuro con botón, una columna cómoda en el móvil.
- **Lo que cambia cada app:** como mucho **un** rasgo propio ligado a su tema (en open-tabs, las seis cuerdas que separan secciones). No hay color de marca por app.

## Typography: tres voces

| Voz | Fuente | Para |
|---|---|---|
| Brand (`.brand`, `.nav`) | Host Grotesk 800, mayúsculas, +0.04em | El nombre de la app y la navegación principal. Nunca para leer. |
| Text | Host Grotesk 400 y 500 | Todo lo que se lee: títulos, cuerpo, botones con palabras. |
| Tech (`.tech`, `.label`, `.tag`, `.meta`) | IBM Plex Mono 400 y 500 | Lo que imprimiría una máquina: fechas, números, unidades, IDs, etiquetas, estados, atajos, código. |

- Seis tamaños de texto (`--text-xl`, `--text-l`, `--text-m`, `--text-s`, `--tech-m`, `--tech-s`) y dos de marca. Ninguno más, y nunca menos de 13px. Los campos de formulario van a 16px (si no, el iPhone hace zoom).
- Un `h1` (`--text-xl`) por pantalla. Interfaces densas (tablas, paneles): cuerpo a `--text-s` y datos a `--tech-s`.
- La jerarquía sale del tamaño y el peso, no del color. 500 es la única "negrita" del texto corrido.
- Etiquetas y reconocimientos en Tech, entre corchetes: `[3 canciones]`, `[Guardado]`.
- Números que se alinean: cifras tabulares (`.num`, ya incluidas en `.tech`).
- Fuentes servidas desde `public/fonts/` (woff2, solo latín): ninguna petición a Google Fonts.

## Colors

Casi negro sobre blanco roto (`#131313` sobre `#F7F7F5`), invertido en oscuro (`#EBEBE6` sobre `#10100F`) y un gris (`--ink-2`) para lo secundario.

- El color solo significa algo: `--danger` para errores y acciones destructivas, `--ok` para confirmar, y colores de categoría o estado si la app los necesita (definidos en `app.css`, con su significado anotado aquí).
- Lo que se pulsa se distingue por forma (botón, subrayado), no por color: el botón principal es tinta invertida y los enlaces van subrayados.
- Claro y oscuro: sigue al sistema y la persona puede fijarlo con un botón `[data-theme-toggle]` (lo gestiona `/js/theme.js`, cargado en `<head>`).

## Layout

Una columna de 40rem centrada, 16px de margen en el móvil y zonas seguras del iPhone (`.page`). Espaciado en múltiplos de 4px. La acción principal al alcance del pulgar.

## Elevation & Depth

Plano por defecto. Sombra (`--shadow`) solo en lo que flota de verdad: hojas y diálogos.

## Shapes

Dos radios: 8px en controles, 14px en superficies. Áreas táctiles de 44px como mínimo.

## Components

Clases de `base.css`: `.page`, `.stack`, `.brand`, `.nav`, `.lead`, `.small`, `.tech`, `.label`, `.tag`, `.btn` (`.primary`, `.quiet`, `.danger`), `.field`, `.inline-form`, `.list` (con `.meta`), `.sheet` (también en `<dialog>`), `.empty`, `.status` (`.error`, `.ok`), `.theme-toggle`, `.muted`, `.num`, `.visually-hidden`.

- **Listas antes que tarjetas.** Filas separadas por una línea fina; los metadatos a la derecha, en Tech.
- **Estados siempre:** cargando, vacío (una frase que diga qué hacer), error (qué ha pasado y qué hacer) y éxito discreto en `.status` (`role="status"`).
- **Movimiento:** 140ms y solo como respuesta a algo que hace la persona. Se respeta "reducir movimiento".

## Writing

- Español, corto y concreto: "Guardado", no "¡Tu elemento se ha guardado con éxito!".
- Sin `·` como separador, sin rayas (— y –): comas, dos puntos, paréntesis o palabras.
- Nada que suene a IA: "no es X, es Y", frases sueltas dramáticas, listas de tres por ritmo, resúmenes de cierre, palabras vacías.

## Do's and Don'ts

Haz:

- Iconos solo si aclaran (SVG en línea, trazo de 1.5px, del color del texto). Nunca emojis como iconos.
- Probar en 390px y en escritorio, en claro y en oscuro, antes de dar algo por terminado.

No hagas:

- Rejillas de tarjetas iguales con sombra, degradados, texto con degradado, brillos de color, color decorativo.
- Pretítulos en mayúsculas espaciadas (las mayúsculas son solo de Brand), flechas `→` en cada botón, números 01/02/03 si no es una secuencia.
- Otras fuentes, librerías de componentes o frameworks de CSS: la base ya cubre lo necesario.
