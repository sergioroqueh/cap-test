# CAP Test — R20: auditoría por convocatoria y pruebas de integridad

Fecha: 05/11/2026. Rama `feat/examenes-cap-auditoria-2026-11`, PR #6 **draft**, sin fusión a `main`.

## Regla editorial

Los PDF de exámenes preservan preguntas, opciones, fecha, modelo y páginas. Las 22 plantillas conservan 2.200 letras originales y sus SHA-256 sin alteraciones. El banco original de 8.655 preguntas es una segunda fuente; **no reemplaza silenciosamente la hoja original**. En conflictos, pregunta visible pero sin calificación. Una coincidencia automática o un PDF con texto incoherente no justifica inventar la respuesta.

## Inventario por convocatoria

Cada fila contiene 100 preguntas del examen principal. **M=mercancías, V=viajeros.** Las páginas proceden del `manifest.json`. La columna «concord. banco» cuenta las coincidencias declaradas en el registro de lectura de plantilla y **no** significa una revisión editorial de las 100 preguntas. Para julio 2023 A se refiere únicamente a la fase 1–43; el desfase 44–99 tiene otro expediente.

| Fecha | Tipo | Modelo | Puntuables | Sin clave | Concord. banco* | Prioridad |
|---|:---:|:---:|---:|---:|---:|:---:|
| 2022-05-21 | M | GLOBAL | 35 | 65 | — | P3 |
| 2022-10-01 | M | GLOBAL | 100 | 0 | 70 | P2 |
| 2022-11-26 | M | GLOBAL | 100 | 0 | 55 | P1 |
| 2023-02-04 | M | GLOBAL | 100 | 0 | 89 | P2 |
| 2023-03-25 | M | GLOBAL | 100 | 0 | 67 | P2 |
| 2023-06-03 | M | GLOBAL | 100 | 0 | 83 | P2 |
| 2023-07-29 | M | A | 100 | 0 | 29 | P0 |
| 2023-07-29 | M | B | 100 | 0 | 72 | P2 |
| 2023-09-23 | M | GLOBAL | 100 | 0 | 81 | P2 |
| 2023-12-02 | M | GLOBAL | 24 | 76 | — | P3 |
| 2024-04-06 | M | GLOBAL | 100 | 0 | 73 | P2 |
| 2024-04-06 | V | GLOBAL | 76 | 24 | — | P3 |
| 2024-05-25 | M | GLOBAL | 100 | 0 | 69 | P2 |
| 2024-07-20 | M | A | 100 | 0 | 82 | P2 |
| 2024-07-20 | M | B | 100 | 0 | 85 | P2 |
| 2025-02-01 | M | GLOBAL | 100 | 0 | 84 | P2 |
| 2025-03-29 | M | GLOBAL | 100 | 0 | 85 | P2 |
| 2025-07-26 | M | A | 99 | 1 | 66 | P0 |
| 2025-07-26 | M | B | 85 | 15 | — | P3 |
| 2025-09-27 | M | GLOBAL | 100 | 0 | 30 | P1 |
| 2026-02-07 | M | GLOBAL | 99 | 1 | 86 | P0 |
| 2026-03-28 | M | GLOBAL | 99 | 1 | 80 | P0 |
| 2026-05-30 | M | GLOBAL | 100 | 0 | 79 | P2 |
| 2026-07-25 | M | A | 100 | 0 | 98 | P2 |
| 2026-07-25 | M | B | 100 | 0 | 97 | P2 |
| 2026-09-26 | M | A | 100 | 0 | 90 | P2 |

**Totales comprobados:** 26 exámenes / 2.600 preguntas; 22 plantillas completas / 2.200 letras conservadas; **2.417 puntuables**, **183 sin calificar** (3 contradicciones y 180 de cuatro modelos sin hoja). El banco general 8.655 preguntas/33 cuestionarios permanece sin modificaciones.

## Priorización R20

- **P0 — Fuente contradictoria (3):** Mercancías A 26/07/2025 q43, Mercancías Global 07/02/2026 q61 y Mercancías Global 28/03/2026 q43. Mantener visibles sin puntuación y sin error en estadísticas.
- **P0 — Alineación (1):** Mercancías A 29/07/2023. Sus 100 letras impresas no se modifican; q44–99 usan correspondencia documental n+1 y q100 no tiene casilla 101. Conservar las 13 decisiones editoriales y su aviso.
- **P1 — Baja coincidencia documentada con el banco:** Mercancías 27/09/2025 (30/100) y 26/11/2022 (55/100). Revisar enunciado y **cuatro opciones** directamente contra examen principal y plantilla original. La falta de coincidencia con el banco no demuestra error de la respuesta.
- **P2 — Resto con plantilla:** contraste editorial sistemático por bloques de 100, priorizando transcripciones provisionales, opciones raras, imágenes y preguntas de normativa modificada. No promocionar por similitud textual sin prueba.
- **P3 — Sin plantilla:** 21/05/2022 Mercancías (65 sin clave), 02/12/2023 Mercancías (76), 26/07/2025 Mercancías B (15), 06/04/2024 Viajeros (24). Se conserva la parte conocida del banco y se dejan las 180 sin respuesta automática; no cruzar Mercancías/Viajeros.

## Hallazgo nuevo comprobado sobre imagen del PDF original

**Mercancías Global 28/03/2026 q43 (página 355 de `Examenes TOTALES.pdf`):** la propia hoja impresa pregunta qué circunstancia produce «problemas de circulación sanguínea», mientras las respuestas tratan **placas de hielo**, **levantamiento de pesos**, **invasión de zonas restringidas** y **manejo imprudente de maquinaria**. Se ha observado directamente la imagen de esa página del archivo original: no es un problema inventado por el extractor OCR. No es posible asegurar una clave inequívoca para el enunciado tal como está escrito. La plantilla conserva **C**, el banco **B**, y `correctAnswer=null`. Documentar como anomalía de examen fuente y no puntuar; no reformular el texto atribuyéndolo falsamente al PDF.

**Mercancías 07/02/2026 q61 (página 284):** el Reglamento (UE) 165/2014 artículo 36.1.ii, versión consolidada de 31/12/2024, exige presentar la tarjeta de conductor en un tacógrafo analógico **si posee una**; alternativa C. La hoja oficial indica A («Sí, siempre»). No cambiar la respuesta impresa y no puntuar mientras se mantenga la contradicción. [EUR-Lex](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A02014R0165-20241231).

**Mercancías A 26/07/2025 q43:** el texto del cuestionario oficial ordena motores «de mayor a menor consumo específico»; la alternativa B plantea el orden descendente y la hoja marca A. Mantener el bloqueo y la procedencia. [PDF oficial JCCM](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250728/2025_cap_4a_prueba_cuestionarios.pdf).

## Implementación y prueba automatizada

Se añade `scripts/build_convocation_audit_r20.py` a `prepare:data`. Lee los derivados `public/data/exams/questions/*.json`, el CSV y el índice de hojas originales; produce **`convocatorias_auditoria_r20.csv`** y **`convocatorias_auditoria_r20.json`**. Se archivan en el artefacto CI `cap-exam-review`.

Comprobaciones obligatorias: cada modelo tiene q1–100, encabezado y cuatro opciones; 26 modelos, 22 plantillas, 2.200 letras, 2.417 puntuables, 183 no puntuables, 3 conflictos, 57 posiciones especiales, 13 resoluciones editoriales; se comprueba que el PDF de marzo q43 conserva íntegro el texto y el bloqueo. El proceso **no escribe ningún archivo de respuestas de origen ni toca `main`**.

## Beta: límites de la comprobación

La CI automatizada cubre extracción, builds, integridad y reglas de puntuación. Vercel ha devuelto una preview en estado `READY`; eso no constituye por sí mismo una prueba interactiva con clics en pantalla. Sigue pendiente validar manualmente en escritorio y móvil: cargar estudio/examen completos de 100, pasar por q43/q61 conflictivas sin penalización, finalizar resultados, actualizar progreso local, recargar, exportar CSV y alternar entre Mercancías/Viajeros y banco general.

No publicar a producción ni cambiar PR #6 de borrador sin aprobación expresa.
