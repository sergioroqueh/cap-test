# CAP Test 2026 — R19: conservar todas las respuestas históricas sin esconder contradicciones

Fecha: 05/11/2026. Rama de pruebas: `feat/examenes-cap-auditoria-2026-11`; PR #6 (draft); `main` no modificado.

## Objetivo

Construir una versión practicable con los **100 enunciados originales de cada convocatoria que tenga plantilla**, sin perder ninguna respuesta que aparece en sus PDF, ni convertir en «verdadera» una respuesta impresa contradictoria. La versión inicial servirá como base para rondas posteriores de revisión en bloque, examen por examen.

## Modelo de datos real

Los **26 modelos CAP** se importan como JSON versionados bajo `public/data/exams/questions/<examId>.json` durante la compilación. Son 2.600 apariciones y cuatro opciones por pregunta. **22** modelos tienen la plantilla de respuesta original leída y **cuatro** no tienen plantilla. Los modelos sin plantilla se conservan pero se aplazan fuera de los modos de exámenes históricos.

Para cada una de las **2.200 preguntas con plantilla** se conservan por separado:
- `originalSheetQuestionNumber` y `originalSheetAnswer`: número/letra **literal** de la plantilla PDF original. No se recalculan ni se sobrescriben por una corrección editorial.
- `originalSheetSourceFile` y `originalSheetSha256`: trazabilidad al PDF que recibió el usuario.
- `mappedSheetQuestionNumber` y `mappedSheetAnswer`: correspondencia al enunciado cuando existe un desplazamiento documentado.
- `bankAnswer`: respuesta comparable del banco original, cuando hay coincidencia.
- `correctAnswer`: solución seleccionada para autocorrección; puede ser `null` si hay contradicción.
- `scoringEligible`: indica si se puede puntuar. `answerDispute`: conflicto impreso frente a banco y motivo de bloqueo.
- `answerStatus`, `answerEditoriallyVerified`, `transcriptionReview`: origen y revisión editorial.

**Las letras históricas de la plantilla no son automáticamente la verdad normativa**, y la solución del banco tampoco prevalece por defecto cuando hay contradicción.

## Estado cuantitativo comprobado

| Concepto | Cantidad |
|---|---:|
| Exámenes principales importados | 26 |
| Preguntas históricas con enunciado y cuatro opciones | 2.600 |
| Modelos con PDF de respuestas original | 22 |
| Letras históricas originales preservadas | 2.200 |
| Modelos sin plantilla, aplazados | 4 |
| Preguntas con autocorrección admisible | 2.417 |
| Sin autocorrección | 183 |
| Conflictos entre plantilla y banco, no puntuables | 3 |
| Sin autocorrección por falta de plantilla (aplazadas) | 180 |
| Correspondencias especiales de numeración (Julio 2023 A) | 57 |
| Respuestas julio 2023 A aprobadas en revisión editorial específica | 13 |
| Banco general conservado | 8.655 preguntas / 33 cuestionarios |

## Tres contradicciones previamente identificadas

1. **Mercancías A 26/07/2025, q43:** plantilla original **A**, banco/contenido **B**. Enunciado «mayor a menor consumo específico»; contradicción pendiente de decisión editorial.
2. **Mercancías Global 07/02/2026, q61:** plantilla original **A**, banco/referencia Reglamento (UE) 165/2014 art. 36 **C** («si posee una»).
3. **Mercancías Global 28/03/2026, q43:** plantilla original **C**, banco **B**; transcripción del enunciado escaneado todavía requiere revisión.

Las tres **sí figuran dentro de las 100 preguntas del examen**, permiten responder y consultar qué dice cada fuente, pero **no suman puntos ni registran errores o aciertos personales**. En modo examen su solución impresa solo aparece en los resultados; en estudio tras responder.

## Discordancia julio de 2023, modelo A

La hoja de 100 letras está correctamente leída. El PDF de preguntas no encaja numéricamente a partir de q44:
- 1–43: correspondencia normal.
- 44–99: correspondencia editorial documentada a la **fila siguiente** (n+1) de la plantilla. No se afirma conocer la causa oficial.
- q100: no existe casilla 101; mantener soporte del banco, nunca inventar correspondencia de PDF.
- 13 preguntas se respaldaron editorialmente en R18; su respuesta corregida no altera la letra impresa bajo la pregunta original.

## Funcionalidad de la beta R19

- Portada Exámenes CAP. Mercancías y Viajeros separados.
- En exámenes con plantilla, se cargan **las 100 preguntas**, sin omitir las discutidas. Hay estudio con corrección inmediata y modo examen con corrección final.
- Un conflicto sin solución fiable se muestra **sin calificar** y no afecta a nota, fallos, precisión ni progreso. Los simulacros mezclados usan solo preguntas puntuables.
- Los cuatro exámenes **sin plantilla** permanecen en los datos, pero se dejan fuera de la selección de exámenes históricos por ahora.
- **Auditoría por convocatoria**: selector de 22 plantillas, lectura de las 100 filas, opciones A-D, letra impresa, respuesta del banco, corrección aplicada, numeración vinculada, incidencias y filtro de discordancias.
- Exportación **CSV de 2.200 respuestas** desde la portada de pruebas y como artefacto de GitHub Actions.
- `sheet_audit_index.json` prioriza trabajo futuro examen por examen. No desplazar la edición del banco original para resolver conflictos; utilizar archivos de evidencia versionados.

## Próximas rondas de revisión editorial

1. Revisar los **tres conflictos** contra las imágenes de exámenes originales y la normativa aplicable, y documentar qué decisión tomar en puntuación.
2. Revisar **julio 2023 A**: comprobar la discrepancia n+1 con todo el documento de preguntas y la plantilla y resolver el origen de la diferencia o dejar prueba de correspondencia editorial.
3. Revisar de forma sistemática por convocatoria **100 preguntas + sus cuatro opciones**, comparando la hoja impresa y el banco general. Priorizar modelos con mayor proporción de respuestas sin coincidencia con el banco, escaneados/OCR o transcripciones provisionales.
4. Revisar funcionamiento manual en móvil y escritorio: sesión de 100 preguntas, respuesta conflictiva no puntuable, resultados de 99/100, exportación CSV, estudio mezclado y banco original.
5. Cuando la beta esté aprobada, decidir fusión del PR a `main`. La producción no se ha tocado en R19.
6. Más adelante, recuperar las cuatro plantillas inexistentes o investigar normativamente sus 180 respuestas. No inventar claves.

## Trazabilidad y archivos

- Plantillas PDF: `Respuestas(1).zip`, 22 documentos, con SHA-256 por modelo.
- `data-src/cap-exams/answer_keys_visually_verified.json`: 6 claves leídas en rondas anteriores.
- `data-src/cap-exams/visual_batch_candidates_2026_11_05.json`: 16 claves cotejadas posteriormente, incluida julio 2023 A.
- `data-src/cap-exams/editorial_alignment_verified_2023_a.json`: 13 ajustes editoriales con enunciado y texto de alternativa exactos.
- `scripts/build_exam_data.py`: combina todas las fuentes sin sobrescribir respuestas literales.
- `scripts/build_sheet_audit.py`: genera índice de revisión y CSV de 2200 preguntas; verifica recuentos, conflictos y desfases.
- `src/capExams.ts`: carga íntegra de 100 preguntas con campos de origen y bandera de puntuación.
- `src/App.tsx`: visor y modos de estudio/examen corregidos; resultado sin penalizar dudas.
- `public/data/exams/sheet_audit_index.json`, `sheet_audit_2200.csv`: derivados de build, no archivos que editar manualmente.
- CI y despliegue de preview deben estar **SUCCESS/READY** en el HEAD final antes de considerar la tarea cerrada.

Nota: los JSON de preguntas son la fuente estática distribuida en la PWA; IndexedDB/Supabase se emplean para el progreso y las sesiones. No se han creado tablas nuevas de contenido CAP en Supabase en esta ronda.
