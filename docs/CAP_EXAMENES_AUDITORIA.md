# CAP Test — importación auditada de exámenes (05/11/2026)

## Estado: PR de trabajo, sin aprobar para producción

Se conserva el banco original: **8.655 preguntas / 33 cuestionarios**, el login y
el progreso existente. No modifica ni sobrescribe los TXT de origen.

**Estado vigente — Ronda 11 (05/11/2026):** **26/26 modelos completos**
(**25 Mercancías y 1 Viajeros**) con **2.600 apariciones históricas** importadas,
**1.915 respuestas** recuperadas por cotejo con el banco maestro
(**1.839 Mercancías + 76 Viajeros**) y **685 sin autocorrección**.
No faltan preguntas principales por transcribir; las reservas y ampliaciones
se excluyen del recuento. Siguen pendientes revisiones visuales y cotejos
de las respuestas con sus plantillas oficiales.
El apartado siguiente conserva el historial de hitos y cifras de rondas anteriores.

### Ronda 12 — Cruce exacto de preguntas pendientes (05/11/2026)

- El inventario **ya está completo**: 26 modelos, 2.600 apariciones.
  Esta ronda **no añade preguntas ni adjudica letras**; mejora la auditoría
  de las 685 apariciones todavía sin autocorrección.
- Se comparan solamente preguntas de la **misma modalidad** con enunciado y
  **las cuatro opciones normalizadas idénticas** (independientemente de su
  orden). No se equiparan paráfrasis ni preguntas solamente parecidas.
- Para una coincidencia se comprueba por separado la **respuesta textual**
  de cualquier plantilla registrada de *otro modelo*. No se copia su letra
  A/B/C/D, que puede haber cambiado al reordenar las opciones.
- Se descartan como apoyo las respuestas de plantilla con desplazamiento
  provisional, corrección visual pendiente o conflicto explícito con el banco.
  Si aparecen claves contradictorias entre modelos, se registran como
  **contradicción bloqueada**, nunca se vota por mayoría.
- **Resultado CI medido:** 147 apariciones pendientes tienen una repetición
  exacta en otro examen. De estas, **9** están respaldadas por plantillas
  de al menos dos modelos independientes, **89** por la plantilla de otro
  modelo y **49** no tienen plantilla comparable. No se han detectado
  contradicciones entre las plantillas comparables de este subconjunto.
  Estas cifras reflejan **apariciones** (no preguntas únicas) y son
  pistas editoriales; las **685 pendientes** siguen sin puntuarse.
- Pruebas de invariantes **PASS** para esta auditoría y el banco completo,
  [GitHub Actions #41992610729](https://github.com/sergioroqueh/cap-test/actions/runs/41992610729);
  Vercel Preview READY del commit e52f882 (entorno aislado).
- Salidas reproducibles: public/data/exams/cross_model_pending_review.json
  (incluye evidencia por modelo) y el CSV homónimo (priorización editorial).
  Se adjuntan también al artefacto cap-exam-review de GitHub Actions.
- **Separación importante:** las coincidencias se llaman *candidatos
  editoriales*, **no respuestas verificadas**. Tienen approved=false y
  willAffectCorrectAnswer=false. No cambian el valor de correctAnswer,
  las notas ni las frecuencias.
- La [plantilla correctora oficial del 28/03/2026](https://transporte.castillalamancha.es/sites/default/files/2026-03/CAP%202026_2%C2%AA%20-%20Plantillas%20Correctoras.pdf)
  está localizada y fechada por el tribunal el 30/03/2026, pero su
  tabla de casillas aún no ha podido leerse visualmente con seguridad;
  **no se ha usado para completar ninguna de las 19 pendientes**.
- Siguen pendientes la inspección visual de los exámenes escaneados, la
  validación de las plantillas y las pruebas de uso en móvil/escritorio.
  **PR #6 en borrador**; no se toca producción.

### Ronda 11 — Mercancías Global 06/04/2024 (PDF pp. 1–21)

- Examen finalizado: **100 preguntas 1–100, cada una con A–D** y página
  original del PDF guardada en
  `data-src/cap-exams/raw/2024-04-06-mercancias-global.json`.
- La página 21 incluye reservas **101–103**, que quedan
  **excluidas** del banco histórico de apariciones y del simulacro.
- Resultado del cotejo: **73/100** respuestas recuperadas
  exclusivamente del banco maestro; **27/100 sin autocorrección**.
  No se han inventado letras correctas.
- La transcripción visual de las 100 preguntas lleva
  `TRANSCRIPCION_VISUAL_PENDIENTE_REVISION`,
  `transcriptionReview=true`, `reviewRequired=true` y
  `sourceMethod=LECTURA_VISUAL_PDF_PENDIENTE_REVISION`.
  Recuperar una clave del banco no equivale a validar editorialmente la
  transcripción ni a confirmar la respuesta con plantilla original.
- La referencia a `Plantilla Abril 2024.pdf` existe en el manifiesto,
  pero **su clave no está digitalizada** en
  `answer_keys_unverified.json`.
- El informe `docs/CAP_ABRIL_2024_PENDIENTES.md` registra la cola
  de 27 preguntas, posibles candidatos de búsqueda y prioridades de
  comprobación de los enunciados y las respuestas.
- **Final del histórico:** 26 modelos, **2.600 apariciones** (2.500
  Mercancías + 100 Viajeros), **1.915** con respuesta recuperada del banco,
  **685** sin autocorrección y **1.081 IDs distintos** enlazados con
  el banco maestro. Los 8.655 originales y 33 cuestionarios no se
  modifican.
- Nuevas pruebas bloquean la importación de un modelo visual incompleto:
  solo se publican modelos 100/100, se exigen las cuatro opciones,
  páginas válidas, numeración 1–100, ausencia de reservas y separación
  entre Mercancías y Viajeros.
- **CI PASS** del commit `44a0a951eb40069acc5412e431c9ace337abdae0`
  ([ejecución 41988843256](https://github.com/sergioroqueh/cap-test/actions/runs/41988843256))
  y beta independiente Vercel **READY** para ese commit.
- Se conserva **PR #6 como borrador**; no fusionar todavía hasta las
  pruebas de usuario (móvil, escritorio, persistencia, examen y estudio)
  y las validaciones editoriales pendientes.

### Ronda 10 — Mercancías Global 21/05/2022 (PDF pp. 364–383)

- Se han incorporado las **100/100 preguntas principales**, numeración
  secuencial y **cuatro opciones A–D**, según la fuente visual PDF original
  del usuario. Archivo `data-src/cap-exams/raw/2022-05-21-mercancias-global.json`.
- Se recuperaron **35/100** claves mediante el banco maestro; **65**
  preguntas siguen sin respuesta autocorregible y no se puntúan. Todas
  llevan `TRANSCRIPCION_VISUAL_PENDIENTE_REVISION`, `transcriptionReview=true`
  y `reviewRequired=true`, incluidas las 35 cotejadas.
- El examen de mayo de 2022 no tiene plantilla asociada en el manifiesto.
  No se han deducido letras correctas de similitudes del banco.
- El escaneo presenta líneas poco nítidas. Se ha creado el informe
  `docs/CAP_MAYO_2022_PENDIENTES.md` con 65 candidatos/no candidatos
  y las preguntas que requieren lectura visual de mayor resolución
  (especialmente 50, 65, 74 y 100).
- Del último examen pendiente, **Mercancías 06/04/2024**, hay **25/100**
  preguntas transcritas en
  `data-src/cap-exams/raw/2024-04-06-mercancias-global.json`, páginas
  1–5. **Estas 25 preguntas NO se publican en la beta ni se cuentan
  en las frecuencias hasta completar las 100.** La lectura del PDF
  desde la página 6 está temporalmente inaccesible; faltan preguntas
  26–100. No se han reconstruido ni inventado.
- Se añadió un guard para toda fuente visual:
  transcripciones con `0 < count < 100` quedan en preparación sin
  contaminar el recuento, los denominadores o las prácticas.
- Estado global: **2.500 apariciones históricas** (2.400 Mercancías +
  100 Viajeros), **1.842** recuperadas del banco y **658** sin
  autocorrección. **1.056 IDs distintos** del banco original enlazados.
- El original de 8.655 preguntas y 33 cuestionarios, la separación de
  modalidades y la producción en main/GitHub Pages permanecen intactos.
  PR #6 sigue en borrador.

### Ronda 9 — Mercancías Global 28/03/2026 (PDF pp. 348–363)

- Examen de **100/100 preguntas principales con cuatro opciones**, transcrito
  a partir de la imagen original del usuario. Origen:
  `data-src/cap-exams/raw/2026-03-28-mercancias-global.json`.
- **81/100** respuestas recuperadas del banco original; **19/100**
  quedan consultables sin puntuación, no inventadas. Las 100 mantienen la
  etiqueta obligatoria de revisión visual `transcriptionReview=true`.
- Se ha corregido un **desplazamiento en la paginación del manifiesto**:
  marzo 2026 realmente ocupa páginas **348–363**; mayo 2022 comienza
  en la **364** y llega hasta la **383**.
- Se ha localizado la [plantilla correctora oficial de Castilla-La Mancha](https://transporte.castillalamancha.es/sites/default/files/2026-03/CAP%202026_2%C2%AA%20-%20Plantillas%20Correctoras.pdf)
  correspondiente al 28/03/2026, publicada por el tribunal el 30/03/2026,
  con sección «MERCANCÍAS GLOBAL». **No se ha podido leer ni transcribir
  de forma fiable la tabla de casillas**, por lo que no se promueven
  respuestas de esta fuente hasta verificación visual.
- Informe `docs/CAP_MARZO_2026_PENDIENTES.md` con las **19 preguntas**
  bloqueadas, candidatos no aprobados del banco y prioridades de revisión
  (q12, q45 y q99 especialmente).
- Estado general: **2.400 apariciones** (2.300 Mercancías + 100 Viajeros),
  **1.807** con clave recuperada del banco y **593** sin autocorrección.
  **1.031 IDs** de preguntas del banco maestro enlazados al historial.
- Quedan **dos modelos Mercancías** pendientes de transcripción:
  `2022-05-21-mercancias-global` y `2024-04-06-mercancias-global`.
  Banco original de 8.655/33 y separación Mercancías/Viajeros intactos.
- El PR #6 sigue **en borrador**, sin fusionar ni publicar producción.

### Ronda 8 — Mercancías A 26/09/2026 (PDF pp. 128–144)

- Se han transcrito **100/100 preguntas** con cuatro opciones y procedencia
  exacta de cada página. Números 1–100 exclusivos; ninguna pregunta de reserva.
  Archivo `data-src/cap-exams/raw/2026-09-26-mercancias-a.json`.
- Fuente marcada `TRANSCRIPCION_VISUAL_PENDIENTE_REVISION`. Las **100 preguntas**
  siguen con `transcriptionReview=true`, `reviewRequired=true` y
  `sourceMethod=LECTURA_VISUAL_PDF_PENDIENTE_REVISION`.
- El banco maestro permite recuperar **90/100 respuestas** (no validación
  editorial de su exactitud). **10 preguntas** permanecen sin clave autocorregible:
  **2, 6, 8, 22, 27, 29, 40, 45, 82 y 93**. Sus candidatos aproximados
  en `review_hints` **no son claves**.
- Se corrigieron los enunciados transcritos de las preguntas 24 y 37
  para reflejar el original; ambas pasan al cotejo automático. Son
  transcripciones provisionales, pendientes de comprobación editorial integral.
- El manifiesto asocia el examen a `Plantilla A Septiembre 2026.pdf`,
  pero **no existe serie de claves digitales para este modelo** en
  `answer_keys_unverified.json`. No se afirma coincidencia banco/plantilla
  mientras no se coteje el documento de respuestas original.
- Resultado global: **2.300** apariciones (2.200 Mercancías + 100 Viajeros),
  **1.726** respuestas recuperadas del banco, **574** sin autocorrección,
  **981** entradas diferentes del banco enlazadas.
- Quedan por transcribir **tres Mercancías**:
  `2026-03-28-mercancias-global`, `2022-05-21-mercancias-global` y
  `2024-04-06-mercancias-global`.
- La única discrepancia explícita entre banco y plantilla (febrero 2026,
  pregunta 61) sigue bloqueada. El banco original de **8.655 preguntas /
  33 cuestionarios** y el examen de Viajeros se preservan íntegros.
- CI: exige 26 modelos, 2.300 preguntas, revisión visual en las 100,
  páginas originales 128–144, cuatro opciones, ninguna reserva,
  y aislamiento por modalidad. PR #6 permanece borrador y producción intacta.

### Ronda 7 — Mercancías B 26/07/2025 (PDF pp. 185–201)

- Incorporación del **modelo B completo, preguntas 1–100 y cuatro opciones**, con
  número y página PDF de origen por pregunta. No se incluyen reservas 101–103
  de la p. 201. El modelo B **no tiene plantilla original de respuestas**.
- Fuente: transcripción visual provisional, conservada íntegra en
  `data-src/cap-exams/raw/2025-07-26-mercancias-b.json` con el tipo
  `TRANSCRIPCION_VISUAL_PENDIENTE_REVISION`. El importador mantiene
  `transcriptionReview=true`, `reviewRequired=true` y
  `sourceMethod=LECTURA_VISUAL_PDF_PENDIENTE_REVISION` en sus 100 preguntas.
  **No se presenta como transcripción editorial oficialmente validada**.
- El cotejo recuperó **85/100 respuestas solo del banco maestro**, mediante
  igualdad normalizada de pregunta y cuatro opciones o, conservadoramente,
  de enunciado y texto de respuesta. **15** permanecen sin respuesta
  autocorregible; ninguna letra se dedujo de una plantilla inexistente.
- Tras esta importación: **2.200 apariciones** (2.100 Mercancías + 100
  Viajeros), **1.636** con clave del banco, **564** sin autocorrección,
  **930** preguntas históricas distintas enlazadas al banco.
  Quedan **cuatro** modelos Mercancías por transcribir:
  2026-09-26-A, 2026-03-28-global, 2022-05-21-global y
  2024-04-06-global.
- El examen de Viajeros mantiene sus 100 preguntas y las 76 respuestas
  anteriormente recuperadas. Banco original de **8.655/33 intacto**.
- Controles CI: 26 modelos, 2.200 preguntas, números 1–100 sin duplicaciones,
  páginas 185–201, cuatro opciones, marca obligatoria de revisión visual,
  fuente de respuesta diferenciada y ninguna reserva puntuada.
- El PR #6 sigue **en borrador**. Producción en main/GitHub Pages no se modifica.
  La beta aislada debe actualizarse solo tras comprobar CI y commit.
- El cotejo automatizado **no equivale a la validación oficial o visual de
  las 85 claves**. Las sugerencias de similitud siguen sin poder adjudicar
  respuesta y el conflicto explícito de febrero 2026 continúa bloqueado.

### Documentos recibidos
- Exámenes TOTALES.pdf: 499 páginas.
- 25 exámenes principales de Mercancías (19 con texto procesable, seis escaneados).
- Un examen principal de **Viajeros/autobús**, de 06/04/2024, en las páginas 28–50:
  100 preguntas principales transcritas de páginas 28–49; la página 50 contiene
  reservas 101–103 excluidas. No se mezcla con Mercancías.
- Ampliaciones de 06/04/2024 (Mercancías 22–27 y Viajeros 51–56):
  registradas pero **excluidas del recuento de frecuencias** por repetir preguntas.
- Respuestas.zip: 22 plantillas. Se transcribieron 16 series de 100 letras como
  **fuente no validada**, en \`answer_keys_unverified.json\`.
- Faltan plantillas originales de 21/05/2022, 02/12/2023 y modelo B de 26/07/2025.

### Flujo de compilación
\`scripts/build_data.py\` crea el banco original con su control de 8.655/33.
Después \`scripts/build_exam_data.py\`:
1. Lee el catálogo por fecha, modalidad y modelo.
2. Conserva páginas de origen en \`data-src/cap-exams/raw/\`.
3. Extrae 100 preguntas principales (excluye reservas 101–103).
4. Compara el **enunciado y las cuatro opciones** con el banco original.
5. Si las cuatro opciones coinciden aunque el orden sea distinto, traslada la
   respuesta correcta por **texto de opción**, nunca copiando la letra a ciegas.
6. Contrasta la letra de plantilla si existe; nunca resuelve contradicciones
   mediante una suposición.
7. Publica el catálogo, frecuencias e historial de fuentes en \`public/data/exams/\`.

### Estados de respuesta
- \`coincidencia_automatica\`: banco y plantilla están de acuerdo. Aun así, cotejo automático.
- \`respuesta_banco_pendiente_revision\`: solo banco original, revisión editorial pendiente.
- \`solo_plantilla_pendiente_cotejo\`: letra de plantilla pero sin comparación suficiente;
  **no entra a test autocorregido**.
- \`conflicto_plantilla_banco\` / \`conflicto_banco\`: bloqueado para corrección.
- \`sin_respuesta_verificada\`: bloqueado hasta completar cotejo.

Tres etiquetas de opción reconstruidas en febrero 2025 y junio 2023 constan
expresamente en \`override_transcriptions_review.json\`. Requieren revisión visual.

### Frecuencia e interpretación
El contador indica número de **modelos de examen transcritos** distintos en que
se observó la misma pregunta (por coincidencia exacta; variantes aún no fusionadas).
Denominador inicial: 19 modelos de Mercancías con 100 preguntas transcritas.
No expresa probabilidad oficial de la próxima prueba.
No incluye ampliaciones, reservas ni escaneados incompletos.


### Ronda 2 — cotejo ampliado (04/11/2026)
Tras cruzar de nuevo las 1.900 preguntas con el banco original:

| Estado | Preguntas |
| --- | ---: |
| Coincidencia exacta banco + plantilla | 1.044 |
| Coincidencia por enunciado y texto correcto, también confirmada por plantilla | 138 |
| Respuesta solo del banco (coincidencia exacta) | 165 |
| Respuesta solo del banco (mismo enunciado y texto correcto) | 29 |
| Solo plantilla, todavía sin cotejo suficiente | 385 |
| Conflicto banco / plantilla bloqueado | 33 |
| Sin respuesta suficientemente sustentada | 106 |

**Total con respuesta recuperada del banco: 1.376/1.900.**
Son cotejos automáticos, no una revisión humana de las 1.376 soluciones.
La segunda pasada encuentra 170 candidatos con el mismo enunciado y el texto
de la respuesta, de los que 167 se recuperan y tres quedan bloqueados por
contradicción. El método exige que todos los candidatos del banco con ese
enunciado conduzcan al mismo texto de respuesta disponible en el examen.
Todas las coincidencias de segundo nivel se marcan como **pendientes de revisión**.

La interfaz indica "práctica parcial (X/100)" cuando todavía no existen 100
respuestas cotejables. Las preguntas sin respuesta fiable permanecen registradas
en los datos de origen y en la cola de revisión, pero no se autocorrigen.
El examen de Viajeros no se fusiona ni se sortea entre los de Mercancías.

**No fusionar el PR por el mero hecho de que la CI sea verde.** Quedan 33
contradicciones y seis exámenes de Mercancías más el de Viajeros con páginas
escaneadas, además de revisión manual de fuentes.

### Ronda 3 — arranque de Viajeros y asistencia a revisión (04/11/2026)
- Transcripción visual contrastada de las **preguntas 1–18 de Viajeros 06/04/2024**,
  correspondientes a las páginas **28–31 de 499** del PDF.
- No se importaron las reservas 101–103 ni la ampliación del mismo examen;
  Viajeros nunca entra en la mezcla de Mercancías.
- CI de la primera importación: **1.918 apariciones**, de las cuales **18**
  son Viajeros. Entre ellas, **16 respuestas recuperadas del banco original**
  (13 por coincidencia exacta de enunciado y opciones, 3 mediante enunciado y
  texto idéntico de respuesta, siempre pendientes de revisión); 2 sin clave cotejable.
- Los test históricos incompletos se anuncian como **práctica parcial de X/100**.
- Con un único modelo parcialmente transcrito de Viajeros, la pantalla NO muestra
  «100 % de frecuencia» como indicador de importancia; informa que no hay muestra
  suficiente para medir repetición.
- Se generan `review_hints.csv`/`review_hints.json` con hasta tres **candidatos
  de revisión** para preguntas sin coincidencia fiable, basados en semejanza
  de enunciados y opciones. Son sugerencias editoriales: **no modifican respuestas**.
- La cola de revisión incorpora las convocatorias distintas en las que la misma
  pregunta del banco tiene confirmación de concordancia con la plantilla; estas
  evidencias tampoco resuelven conflictos automáticamente.

**Pendiente en aquella ronda:** 82 preguntas principales de Viajeros y los otros exámenes escaneados,
33 conflictos de banco/plantilla, revisión de muestras dudosas y comprobación móvil.
El criterio sigue siendo **PR borrador, no desplegar**.

### Ronda 4 — Viajeros completo y consulta sin autocorrección (04/11/2026)

- Transcripción visual del examen principal íntegro de **Viajeros, 06/04/2024**:
  100 preguntas numeradas de las páginas **28–49**. Las reservas de la página 50
  (101–103) y la ampliación de páginas 51–56 no se mezclan ni se cuentan.
- Importadas **2.000 apariciones** de exámenes: 1.900 Mercancías + 100 Viajeros.
- Entre las de Viajeros, **76 soluciones se han recuperado automáticamente del banco
  de 8.655**, todas sujetas a revisión editorial. **24 siguen sin clave cotejada.**
- Totales generales: **1.452** con respuesta obtenida del banco, **548** sin
  autocorrección; **923** preguntas distintas enlazadas al banco original.
- Se conserva el denominador por modalidad. Con una sola convocatoria de Viajeros,
  la pantalla indica que no hay muestra suficiente para estimar repetición.
- Nueva vista de **preguntas pendientes de revisión**: el usuario puede leer
  enunciado y cuatro opciones de cada pregunta sin solución, pero no puntúa
  ni ve una respuesta inventada.
- Todas las preguntas siguen siendo trazables por fecha, modelo, modalidad,
  número y página del PDF. Las preguntas repetidas solo se deduplican en simulacros
  mezclados, **no** se borran del examen histórico original.

Esta ronda no justifica desplegar: quedan **33 contradicciones** y la verificación
de fuentes y comportamiento móvil sigue pendiente. PR #6 se mantiene en borrador.

### Auditoría de las 33 contradicciones
La CI localizó **30 discrepancias en Mercancías A de julio de 2023**,
**dos en Mercancías B de julio de 2023** y **una en Mercancías de febrero de 2026**.
Se comprobó visualmente la plantilla original A de julio de 2023: contiene
una tabla legible con las 100 letras, incluyendo la pregunta 89 = A,
que contradice la solución del banco en ese enunciado. Esta divergencia
no se puede resolver cambiando una letra sin evidencia independiente.
Los 33 casos **siguen bloqueados** y el archivo de candidatos solo sirve
para facilitar la revisión, nunca para aprobar automáticamente.

### Ronda 5 — examen julio 2023 y verificación de claves (04/11/2026)

**Hallazgo sistemático: modelo Mercancías A, 29/07/2023.** La plantilla
escaneada original permanece íntegra. Al comparar las preguntas que se repiten
idénticas (enunciado y opciones) en otras convocatorias con plantillas distintas,
la coincidencia es **17/17** en las preguntas 1–43. En las preguntas 44–100,
el emparejamiento directo solo coincide **6/23**, pero con un desplazamiento
de **+1 en el número de casilla de plantilla para las preguntas 44–99**
coincide **22/22**. La pregunta 100 queda sin casilla fiable.

La hipótesis documental se registra en
`data-src/cap-exams/template_alignment_review.json`; las 100 filas de origen,
respuesta original, alineación propuesta y respaldo interexámenes están en
`alignment_2023_a_review.csv` (artefacto de GitHub Actions).
**El desplazamiento no es una fe de erratas oficial:** toda respuesta obtenida
por esta vía tiene estado `coincidencia_alineacion_provisional_pendiente_revision`,
se indica al alumno y conserva su procedencia. Las soluciones solo se habilitan
si también coinciden con el texto de la respuesta del banco original.

**Dos errores de extracción por imagen confirmados visualmente**, no errores
de las plantillas: Mercancías B, 29/07/2023, preguntas **6 y 19**.
En la plantilla escaneada ambas son **D**, no la C obtenida por el
reconocimiento automático. La corrección se documenta en
`answer_key_visual_corrections.json`; no se sobrescribe la extracción bruta.
La opción D además está respaldada por el banco y la normativa de transporte:
- Pregunta 6, sin plazo prefijado de duración de autorización de mercancías,
  art. 8 de la Orden FOM/734/2007:
  https://www.boe.es/eli/es/o/2007/03/20/fom734/con
- Pregunta 19, posibilidad de cooperativa de trabajo asociado como titular,
  art. 10, letra a, de la misma Orden, y art. 43 LOTT:
  https://www.boe.es/eli/es/l/1987/07/30/16/con/20241112

**Única divergencia documental restante, bloqueada:** Mercancías, 07/02/2026,
pregunta **61**, página 284. La plantilla original marca **A**, el banco **C**.
El artículo **36.1.ii del Reglamento (UE) 165/2014** establece la obligación
de exhibir la tarjeta de conductor con tacógrafo analógico *si se posee*,
lo que coincide con la opción C. Esta evidencia normativa externa figura en
`normative_conflicts_review.json` y en `review_queue.csv`, marcada como
**pendiente de revisión editorial, sin autocorrección**.
Referencia: https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A02014R0165-20241231

**Resultado de la última compilación:** 26 modelos; 2.000 registros históricos;
**1.484** con solución recuperada del banco (**1.408 Mercancías y 76 Viajeros**);
**516** sin autocorrección, de los cuales **uno** tiene contradicción expresa.
**923** preguntas distintas enlazadas al banco de 8.655; 33 cuestionarios
originales inalterados. CI en verde.

**No fusionar**: seis convocatorias escaneadas de Mercancías sin transcripción,
más revisión humana y pruebas de usabilidad/sincronización.

### Ronda 6 — OCR supervisado de Mercancías A, 26/07/2025

- Fuente: `Examenes TOTALES.pdf`, páginas **97–111**, Mercancías
  **modelo A**, examen fechado **26 de julio de 2025**.
- Extracción en español desde páginas sin texto seleccionable: Tesseract
  con revisión de numeración y opciones, resultado **100/100 preguntas
  principales** con **cuatro opciones** y página por pregunta.
- Se excluyen las preguntas de reserva 101–103. La opción C de
  la pregunta 29 (página 101), que el OCR confundía con `EA`,
  se leyó visualmente del original: **«Sí.»**
- Fuente comprimida y reproducible en
  `data-src/cap-exams/raw/2025-07-26-mercancias-a.json.xz.b64`;
  contiene todas las preguntas y opciones, origen y metadatos.
  Para inspeccionarla se aplica `base64.b64decode` y `lzma.decompress`;
  los datos públicos de compilación siguen siendo JSON legible.
- El generador rechaza números repetidos, fuera de 1–100, páginas fuera
  de intervalo, opciones vacías o examen OCR incompleto.
- Coincidencias con el banco original: **67/100** con clave provisional;
  las otras **33/100** quedan disponibles en la vista sin puntuación.
  Todas las preguntas de este examen llevan `transcriptionReview=true`,
  con aviso de revisión visual en el test: no se presenta el OCR como
  transcripción editorialmente certificada.
- Estado general: **2.100** preguntas históricas, **1.551** cotejadas,
  **549** pendientes de corrección. Se mantienen **8.655/33** originales.
- Se ha evitado que los 100 registros de Viajeros sobrescriban las
  frecuencias del banco general de Mercancías. Denominadores
  actuales: **20** modelos transcritos Mercancías y **1** Viajeros.

**Por hacer:** las cinco pruebas escaneadas restantes, revisar las
preguntas OCR contra páginas originales, auditar la única contradicción
normativa residual y validar navegación, PWA, progreso y sincronización en móvil.

### Criterio de publicación
**No fusionar** este PR hasta:
- CI verde, generación exacta de 26 entradas y 2.100 preguntas procesadas.
- Verificación visual de incidencias y respuestas contradictorias (especialmente
  julio 2023 A/B).
- Confirmar que las preguntas pendientes no muestran soluciones inventadas.
- Probar login, navegación, repaso, sincronización y PWA en un móvil.
- Completar posteriormente los seis modelos escaneados de Mercancías; el examen principal
  de Viajeros ya tiene sus 100 preguntas, pero solo parte de sus respuestas cotejadas.

La rama permite avanzar sin interrumpir producción. No publicar un examen
como «100 preguntas corregidas» si parte de sus soluciones siguen pendientes.
