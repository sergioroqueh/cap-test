# CAP Test 2026 — R24: Mercancías 2022–2024 con plantilla

Fecha 05/11/2026. Repositorio sergioroqueh/cap-test, rama feat/examenes-cap-auditoria-2026-11. PR #6 sigue draft. Main no se toca.

## Alcance

En R24 se excluyen expresamente Viajeros y los tres modelos restantes sin plantilla. Estos se reservan para la fase final junto con las 15 preguntas sin respuesta de julio de 2025 B.

R24 inventaría **10 convocatorias de Mercancías 2022–2024 con plantilla**, con **1.000 preguntas, 1.000 letras históricas y cuatro opciones por pregunta**. Contiene **18 incidencias documentadas**, **7 correcciones de glifos reversibles** y **ningún cambio en las claves**. Una fila en el expediente no significa un cotejo visual individual terminado.

## Resultados por convocatoria

| Fecha | Modelo | Páginas | Letras originales | Coincidencias con el banco | Casos R24 |
|---|---|---|---:|---:|---|
| 01/10/2022 | Mercancías Global | 440–459 | 100 | 70 | q13, q74 |
| 04/02/2023 | Mercancías Global | 238–258 | 100 | 89 | q9, q17, q82 |
| 25/03/2023 | Mercancías Global | 312–331 | 100 | 67 | q33, q50, q87 |
| 03/06/2023 | Mercancías Global | 291–311 | 100 | 83 | q73, q97 |
| 29/07/2023 | Mercancías B | 145–166 | 100 | 72 | q33, q35, q52, q85 |
| 23/09/2023 | Mercancías Global | 460–481 | 100 | 81 | Sin conflicto nuevo demostrado |
| 06/04/2024 | Mercancías Global | 1–21 | 100 | 73 | q1, q71 |
| 25/05/2024 | Mercancías Global | 384–403 | 100 | 69 | q32 |
| 20/07/2024 | Mercancías A | 79–96 | 100 | 82 | Sin conflicto nuevo demostrado |
| 20/07/2024 | Mercancías B | 167–184 | 100 | 85 | q84 |
| **TOTAL** | **10 modelos** | | **1.000** | | **18 casos** |

Las coincidencias con el banco son solapamiento documental, no equivalen a verificar cada solución visual o normativamente.

## Cinco respuestas corroboradas por documentación oficial

- Abril 2024 q71 A: traslado a báscula, límite de 30 km de ida en sentido distinto a la marcha.
- Julio 2023 B q33 B: mismo límite.
- Mayo 2024 q32 B: mismo límite.
- Marzo 2023 q50 B: mismo límite.
- Julio 2024 B q84 B: vehículos híbridos eléctricos enchufables, siglas PHEV.

Fuente BOE para los cuatro casos del traslado: [Ley 16/1987 LOTT, artículo 33.4](https://www.boe.es/buscar/act.php?id=BOE-A-1987-17803&p=20220302&tn=0). Fuente oficial para PHEV: [DGT, distintivo ambiental](https://www.dgt.es/nuestros-servicios/tu-vehiculo/tus-vehiculos/distintivo-ambiental/).

También se contrasta la **pregunta 87 del 25/03/2023**: el Real Decreto 284/2021 artículo 7.2 establece 35 horas de formación continua cada cinco años. Respuesta histórica B. [BOE RD 284/2021 artículo 7](https://www.boe.es/buscar/act.php?id=BOE-A-2021-6624&p=20210424&tn=1). Ni este contraste ni los otros cinco certifican visualmente la plantilla entera.

## Siete errores de extracción textual corregidos sin cambiar respuestas

- 01/10/2022 q13: AI de animales → Al de animales.
- 25/03/2023 q33: AI rozamiento → Al rozamiento.
- 25/03/2023 q87: Iugar / AI menos → lugar / Al menos.
- 03/06/2023 q73: nuIo → nulo.
- 29/07/2023 B q35: AI estómago → Al estómago y equivalentes.
- 29/07/2023 B q52: AI cumplimentar → Al cumplimentar.
- 29/07/2023 B q85: AI abandonar → Al abandonar.

Cada derivado conserva el enunciado anterior, las cuatro opciones antiguas, página, método y etiqueta R24. Los archivos de extracción originales se dejan intactos. Las pruebas bloquean cambios de clave, banco, posición, página y frecuencia.

## Reconstrucciones que permanecen pendientes de cotejo visual

Febrero de 2023 q9, q17 y q82: la capa textual del PDF pegó la etiqueta de la alternativa A, con fragmentos «aAquel», «ase requiere» y «aesperar». La reconstrucción previa se conserva, todavía pendiente de imagen.

Junio de 2023 q97: la letra C no aparece en la capa textual, aunque el texto de su alternativa sí aparece entre B y D. La reconstrucción por posición no sustituye a una comprobación visual de la imagen original.

## Caso importante: falso comienzo de pregunta en octubre de 2022 q74

La alternativa C contiene «12.000 kg». Una lectura ingenua lo interpretaría como pregunta 12, cortaría la opción C y perdería la D. El parser real conserva íntegramente la pregunta 74 y sus cuatro opciones. Se incorpora una prueba específica para que esta integridad no se pierda en el futuro. La respuesta D original no cambia.

## Fuente de transcripción provisional

Abril de 2024 Mercancías tiene 100 preguntas procedentes de una transcripción visual preparatoria etiquetada como pendiente de revisión. La q1 está señalada como recordatorio y la q71 documentada normativamente, pero **no se afirma haber verificado visualmente todos los enunciados y alternativas**. Las 100 letras de su plantilla original sí están preservadas.

## Balance global tras R24

| Bloque | Modelos | Preguntas inventariadas |
|---|---:|---:|
| R22 | 3 | 300 |
| R23 | 10 | 1.000 |
| R24 | 10 | 1.000 |
| **Total con expediente** | **23/26** | **2.300/2.600** |
| **Tres modelos aplazados completos** | **3** | **300** |

Los aplazados completos son: Mercancías 21/05/2022, 100 preguntas (65 sin puntuación); Mercancías 02/12/2023, 100 (76 sin puntuación); y Viajeros 06/04/2024, 100 (24 sin puntuación). En conjunto tienen 165 preguntas sin respuesta puntuable. Además, el modelo B de julio 2025 conserva 15 sin respuesta dentro del expediente R23: **180 sin plantilla y sin puntuación**.

Se conservan **26 exámenes y 2.600 preguntas, 22 plantillas y 2.200 letras originales, 2.417 puntuables, 183 sin puntuación**, de las cuales tres son los conflictos anteriores sin resolver. El banco general de **8.655 preguntas y 33 cuestionarios** sigue intacto. La duda técnica de noviembre 2022 q6 permanece marcada P0, pero puntúa provisionalmente con A. No se ha mezclado Mercancías con Viajeros.

## Archivos e implementación

- data-src/cap-exams/r24_editorial_cases.json: 18 incidencias, evidencia y prioridad, sin cambios de respuesta.
- scripts/build_exam_data.py: siete restauraciones reversibles con guardas.
- scripts/build_editorial_triage_r21.py: diferencia restauraciones R24 frente a R22.
- scripts/build_editorial_casebook_r24.py: CSV de 1.000 preguntas y balance 23/3 modelos, 2.300/300 preguntas.
- public/data/exams/editorial_casebook_r24.json / .csv y editorial_progress_r24.json: resultados derivados.
- src/capExams.ts y src/App.tsx: anotaciones R24 en auditoría y descarga CSV exclusiva de Mercancías con plantilla.
- scripts/test_exam_data.py: guardas de número, cuatro opciones, letras, siete restauraciones y ausencia de modelos aplazados.
- package.json y .github/workflows/ci.yml: build, pruebas y artefactos de auditoría y preview sin tocar producción.

CI valida datos y build aislada, pero no constituye prueba real de navegación. R23 agotó la cuota diaria de despliegues por API de Vercel; no afirmar una nueva preview READY hasta verificar un despliegue para el SHA final.

## Fase final siguiente — R25

Conforme a la decisión del usuario, abordar **Viajeros y todos los modelos sin plantilla conjuntamente**: Mercancías de mayo 2022 y diciembre 2023, Viajeros abril 2024, más las 15 sin respuesta del modelo B julio 2025. Buscar plantillas originales verificables y cotejar fuentes. No inventar ninguna letra. Tras ello, revisión final global de los tres conflictos bloqueados, duda técnica noviembre 2022 q6, desfase julio 2023 A y prueba manual en móvil/PC. No fusionar el PR #6 a main sin aprobación.
