# CAP Test 2026 — Revisión del examen Mercancías 28/03/2026

Fecha de auditoría: 04/11/2026. Modelo `2026-03-28-mercancias-global`.
Fuentes: PDF original del usuario, páginas **348–363 (1-based)**,
`data-src/cap-exams/raw/2026-03-28-mercancias-global.json` y banco
maestro original de **8.655 preguntas / 33 cuestionarios**.

## Resultado reproducible de la beta

- 100/100 preguntas principales transcritas, A–D, sin reservas.
- **81/100** con respuesta candidata recuperada por cotejo exacto del banco
  de referencia (incluido el rescate conservador por enunciado y texto).
- **19/100** sin respuesta autocorregible.
- Las 100 se marcan `TRANSCRIPCION_VISUAL_PENDIENTE_REVISION`,
  `transcriptionReview=true` y `reviewRequired=true`.
- Corregida la ficha de procedencia en `manifest.json`:
  marzo 2026 es **p.348–363**, y mayo 2022 comienza en **p.364**.
- No digitalizar claves a partir de semejanza: `review_hints`
  contiene **propuestas NO aprobadas**.

## Fuente pública primaria para una segunda verificación

La Junta de Comunidades de Castilla-La Mancha publicó la plantilla correctora
para el **28/03/2026**, aprobada por su tribunal el **30/03/2026**.
El PDF incluye sección `MERCANCÍAS GLOBAL` y `MERCANCÍAS AMPLIACIÓN`.
Se debe utilizar **solo MERCANCÍAS GLOBAL** y conservar la ampliación
fuera de las frecuencias y del examen principal.

URL oficial:
https://transporte.castillalamancha.es/sites/default/files/2026-03/CAP%202026_2%C2%AA%20-%20Plantillas%20Correctoras.pdf

**Advertencia:** se ha localizado la plantilla oficial, pero no se han
inspeccionado de forma fiable las casillas de la tabla de respuestas. No
se ha incorporado ninguna letra de ese PDF ni se ha afirmado un cotejo
oficial definitivo. El archivo original `Plantilla Marzo 2026.pdf`
figura en el catálogo, pero aún no tiene clave digitalizada en
`answer_keys_unverified.json`.

## Preguntas pendientes de cotejo

| Nº | Pág. PDF | Código maestro sugerido | Nota editorial |
|---:|---:|---|---|
| 12 | 349 | 5437 | Opciones y límites de MMA no equivalentes; verificar norma histórica |
| 25 | 352 | 90035 | Diferencia leve del enunciado y una opción; comparar texto original |
| 26 | 352 | 812 | Enunciado diferente; opciones similares de marcado CE. Contrastar categorías II/III |
| 44 | 355 | 1880 | Respuesta «tacógrafos digitales» frente a «tacógrafos»; no forzar |
| 45 | 355 | — | **Alta prioridad**: enunciado de la transcripción necesita revisión visual literal; sin candidato aceptable |
| 48 | 355 | 2555 | Enunciado genérico «Señale la afirmación correcta» aparece en variantes múltiples |
| 50 | 356 | 2993 | La respuesta candidata del banco omite el artículo «las» |
| 52 | 356 | 3362 | «factores técnicos» frente a «elementos técnicos»; comparar |
| 53 | 356 | 3581 | «¿De dónde consigue?» frente a «¿De dónde se consigue?» |
| 54 | 356 | 3626 | Variación de enunciado y opciones sobre tarjeta de conductor |
| 58 | 357 | 7963 | «caja» frente a «embalaje exterior» del medicamento |
| 59 | 357 | 4095 | «La hoja de registro»/«es el documento donde»; comprobar |
| 73 | 359 | 6974 | Diferencia «24 h»/«veinticuatro horas»; normativa laboral |
| 84 | 361 | 6742 | «fabricante»/«fabricante del vehículo» |
| 85 | 361 | 6746 | «otra serie»/«una serie»; negación «incorrecta» esencial |
| 88 | 361 | 1699 | Una opción diferente del banco; verificar literalidad |
| 89 | 362 | 7939 | «salidas que estén»/«salidas que se encuentren» |
| 96 | 363 | 65282 | Enunciado breve genérico y una opción distinta |
| 99 | 363 | 7919 | **Alta prioridad**: límite económico del seguro; normativa vigente a la fecha del examen y plantilla original |

Los códigos de candidato proceden de `review_hints.json` en la beta y son
solo pistas. **Ningún código o coincidencia aproximada aprueba una respuesta.**
Las 19 preguntas son consultables pero no puntuables hasta cotejo suficiente.

## Siguiente control editorial

1. Inspeccionar las casillas de **MERCANCÍAS GLOBAL** de la plantilla oficial,
   comprobando 1–100 sin desplazamientos.
2. Comparar con banco y PDF por enunciado/opciones; no copiar letras por
   mera proximidad de plantillas.
3. Documentar cada decisión verificable y mantener bloqueadas las divergencias.
4. Priorizar q45, q12 y q99, además de cualquier discrepancia oficial.
5. Recompilar y exigir pruebas automatizadas, seguida de revisión de la
   beta independiente; no fusionar el PR #6.
