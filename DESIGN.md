---
name: Apps del homelab
description: Base visual común de las apps de Miguel. Cada app cambia el tono del acento y poco más.
colors:
  accent: "oklch(50% 0.14 var(--hue))"
  bg: "oklch(98.5% 0.004 var(--hue))"
  surface: "oklch(100% 0 0)"
  sunken: "oklch(95.5% 0.006 var(--hue))"
  ink: "oklch(22% 0.012 var(--hue))"
  ink-2: "oklch(45% 0.012 var(--hue))"
  ink-3: "oklch(52% 0.01 var(--hue))"
  line: "oklch(22% 0.02 var(--hue) / 0.12)"
  danger: "oklch(52% 0.18 27)"
  ok: "oklch(52% 0.12 150)"
typography:
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "2.074rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.833rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "8px"
  surface: "14px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s6: "24px"
  s8: "32px"
  s12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Diseño

Las apps del homelab son herramientas personales que Miguel usa sobre todo desde el iPhone. Comparten un esqueleto (este documento y `public/css/base.css`) para que todas se sientan de la misma familia aunque hagan cosas muy distintas. La base está en `base.css` y **no se edita en cada app**: lo propio va en `public/css/app.css`.

## Overview

Herramienta, no escaparate. Claras, sobrias, rápidas y con algo de oficio: el aspecto de algo hecho a mano por una persona con criterio, no de una plantilla.

- **Lo que comparten todas:** tipografía del sistema, escala de tamaños, espaciado, dos radios, listas en vez de tarjetas, modo oscuro automático, una columna cómoda en el móvil.
- **Lo que cambia cada app:** el tono del acento (`--hue` en `app.css`) y, como mucho, **un** rasgo propio ligado a su tema (en open-tabs, las seis cuerdas que separan secciones). Un solo rasgo; el resto, callado.

Ficha de esta app (rellénala al crearla):

- Tono (`--hue`): 165, verde pino.
- Rasgo propio: las seis cuerdas (`.strings`, separador con seis líneas, la más gruesa abajo, como en el mástil) y el riel de trastes (`.fret-rail`, puntos de los trastes 3-5-7-9 y la octava en el 12 en el borde derecho del lector; el punto verde marca por dónde vas).
- Lo demás propio de la app: el cuerpo de la tab va en monoespaciada (ahí la alineación es el significado) y los acordes en azul (`--chord`), distinto del acento para no confundirse con lo pulsable, con contraste AA en claro y en oscuro. El modo oscuro es el del escenario: tiene que leerse bien con poca luz.

## Colors

Neutros con una pizca del tono de la app, un acento y dos colores de estado. Todo en OKLCH, así un solo número (`--hue`) da una paleta coherente en claro y en oscuro.

- El acento marca lo que se puede pulsar y el estado activo. No decora: ni fondos de sección, ni degradados, ni texto de colores.
- `ink` para texto, `ink-2` para secundario, `ink-3` solo para metadatos (fechas, contadores). Todos cumplen contraste AA.
- `danger` solo para errores y acciones destructivas; `ok` solo para confirmar.

## Typography

La del sistema (San Francisco en el iPhone): cero descargas, se lee perfecta y no parece web genérica. Escala 1.2: título, sección, cuerpo y pequeño. Nada más.

- Un título por pantalla. Tamaño de texto mínimo 16px en campos (si no, el iPhone hace zoom).
- Números que se comparan, con cifras tabulares (`.num`).
- Sin MAYÚSCULAS en etiquetas, sin pretítulos sobre los títulos, sin destacar una palabra del título en otro color.

## Layout

Una columna de 40rem centrada, con 16px de margen en el móvil y las zonas seguras del iPhone respetadas (`.page`). Espaciado en múltiplos de 4px. Lo importante arriba; la acción principal al alcance del pulgar.

## Elevation & Depth

Plano por defecto. La sombra (`--shadow`) solo para lo que flota de verdad: hojas y diálogos. Nada de sombras de colores ni brillos.

## Shapes

Dos radios: 8px en controles, 14px en superficies. Áreas táctiles de 44px como mínimo.

## Components

Clases de `base.css`: `.page`, `.stack`, `.btn` (`.primary`, `.quiet`), `.field`, `.inline-form`, `.list`, `.sheet` (también en `<dialog>`), `.empty`, `.status`, `.muted`, `.num`, `.visually-hidden`.

- **Listas antes que tarjetas.** Filas separadas por una línea fina; los metadatos a la derecha y en pequeño.
- **Estados siempre:** cargando, vacío (una frase que diga qué hacer), error (qué ha pasado y qué hacer) y éxito discreto en `.status` (`role="status"`).
- **Movimiento:** 140ms y solo como respuesta a algo que hace la persona. Sin animaciones de entrada. Se respeta "reducir movimiento".

## Do's and Don'ts

Haz:

- Textos en español, cortos y concretos, como los escribiría Miguel: "Guardado", no "¡Tu elemento se ha guardado con éxito!".
- Iconos solo si aclaran (SVG en línea, trazo de 1.5px, del color del texto). Nunca emojis como iconos.
- Probar en 390px y en escritorio, en claro y en oscuro, antes de dar algo por terminado.

No hagas (son las señales de "hecho por una IA"):

- Rejillas de tarjetas iguales con la misma sombra, degradados decorativos, texto con degradado, brillos de color.
- Pretítulos en mayúsculas espaciadas, `A · B · C` como adorno, flechas `→` en cada botón, números 01/02/03 si no es una secuencia.
- Fondo crema con serif y acento terracota, o negro con verde ácido, porque sí.
- Fuentes web, librerías de componentes o frameworks de CSS: la base ya cubre lo necesario.
