# C19 · Trazabilidad visible de la respuesta y métricas de procedencia — 17/11/2026

## Necesidad
Cada alumno debe poder conocer **qué respalda la solución** de una pregunta. Tener una letra en el banco NO acredita por sí solo que una norma o tribunal la confirme. La UI anterior ofrecía el botón opcional «Ver fundamento», que solo mostraba `norm` y `reference` del banco y no separaba suficientemente hoja, evidencia independiente y revisión técnica.

## Implementación en rama comercial, PR #21 DRAFT
- `src/AnswerProvenance.tsx` + `src/answerProvenance.css`: ficha mobile-first; no cambios de datos o scoring.
- `src/types.ts`: reconoce cuatro metadatos **ya emitidos** por `build_exam_data.py`: URL/nombre de evidencia pública y autoridad declarada de la hoja original.
- `src/Quiz.tsx`: tarjeta visible automáticamente **solo al corregir en Estudio**. El modo Examen no revela ni fuente ni clave antes de la entrega.
- `src/App.tsx`: tarjeta en **cada elemento de la revisión del resultado** (incluidas las preguntas sin puntuar); el alumno puede pulsar «Ver todas las respuestas».
- Fuentes de la letra impresa: nombre de plantilla original, casilla, huella SHA-256 resumida y señalización de correspondencia editorial especial. No se enlaza a PDF privado ni se inventa URL de tribunal.
- Cuando constan, enlaces HTTPS a evidencia oficial independiente y a las referencias de las decisiones técnicas R27–R31. La revisión editorial no se presenta como fe de erratas del tribunal.
- Texto del banco `norm/reference` etiquetado explícitamente como **referencia heredada pendiente de cotejo individual**, jamás como norma validada por defecto. Si no hay fuente registrada: se indica «Fuente pendiente».
- Para respuestas excluidas, tarjeta «Trazabilidad · sin puntuación»; no implica rehabilitar esa respuesta ni aprobarla para scoring.

## Recuperación de citas ya auditadas sin cambiar la corrección
Los expedientes R29, R30 y R31 contienen **36 + 23 + 117 = 176** decisiones de tipo `confirmed` con fuentes HTTPS. Antes estaban registradas en los expedientes de auditoría, pero no viajaban a la ficha individual del alumno. Los generadores de esas rondas ahora adjuntan exclusivamente `answerSourceReview` con ronda, motivo y enlaces a los JSON de preguntas **generados**. Esto no altera `correctAnswer`, `originalSheetAnswer`, `technicalDecision`, opciones, IDs ni scoring. Los tests existentes comprueban equivalencia de claves y los nuevos tests exigen que las 176 citas se preserven sin reinterpretarlas como erratas oficiales. Los conteos de modelos con notas R29–R31 se mantienen diferenciados de los modelos que solo reciben metadatos.

## Medición para no confundir UX con calidad del contenido
`scripts/audit_answer_provenance.py` recorre los archivos generados del banco general y exámenes; exige 176 citas confirmadas válidas y emite contadores agregados sin texto de preguntas, soluciones ni enlaces individuales. Controla coherencia del nombre y SHA de las hojas con letra original. Ejecutado en CI bajo «Audit answer provenance coverage (aggregate only)», salida agregada `artifacts/cap-answer-provenance-coverage.json` incluida en el artefacto de revisión. **Los contadores no significan validación de rigor técnico, actualidad normativa ni permiso de reproducción.**

## Pruebas añadidas
`scripts/e2e_cap_focus.mjs`: el modo Examen no deja ver la procedencia antes de entregar; el desglose posterior ofrece ficha en todas las respuestas; el modo Estudio muestra la ficha tras responder, con enlaces HTTPS para casos técnicos documentados; las excluidas permanecen sin puntuación. Mantener comprobaciones de móvil, puntuación y no-regresión.

## Hallazgo documental del banco general — marcadores vacíos
Auditoría local del preview comercial generado por CI: aunque las 8.655 preguntas tienen cadenas no vacías en `norm` y `reference`, **4.428** registros llevan `Sin referencias doctrinales` y **78** llevan `Sin referencia` en el campo `norm`; son **78** posiciones con ambos campos marcadores. Sólo **12** filas incluyen alguna URL cruda en esos dos campos. Estas cifras miden forma, no validez. La ficha C19 ya filtra marcadores como vacíos y, si no existe fuente adicional, presenta «Fuente pendiente». El auditor C19 los separa ahora de los campos nominalmente rellenados. No tratar manuales citados sin sección/página como una validación individual de la respuesta.

## Barreras que siguen cerradas
- Ningún cambio en las **fuentes originales** `data-src/`, letras, opciones, IDs, frecuencia, scoring ni progreso. Las preguntas **generadas** incluyen únicamente nuevos metadatos de citas `answerSourceReview` para confirmaciones R29–R31.
- El lote privado CLM C13 no se ha incorporado a la app ni a CI; los seis holds siguen excluidos y los textos no se publican.
- Falta cotejo jurídico y de reutilización de las plantillas CLM; esta tarjeta no supone clearance.
- Sin merge de `main`, deploy, OAuth, Supabase, cambios de dominio ni gastos.

## Siguiente fase de corpus
Revisar el informe de cobertura C19 y priorizar por impacto las preguntas sin evidencia individual, con criterio temporal (examen histórico frente a norma vigente). Cerrar las seis retenciones CLM y la restauración de mayo M32 sin fusionar IDs ni migrar progreso. Solo declarar aceptación de C19 tras CI y **capturas reales** de tarjeta en móvil y desktop.
