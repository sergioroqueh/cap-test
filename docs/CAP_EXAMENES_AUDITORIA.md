# CAP Test — importación auditada de exámenes (04/11/2026)

## Estado: PR de trabajo, sin aprobar para producción

Se conserva el banco original: **8.655 preguntas / 33 cuestionarios**, el login y
el progreso existente. No modifica ni sobrescribe los TXT de origen.

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

### Criterio de publicación
**No fusionar** este PR hasta:
- CI verde, generación exacta de 26 entradas y 2.000 preguntas procesadas.
- Verificación visual de incidencias y respuestas contradictorias (especialmente
  julio 2023 A/B).
- Confirmar que las preguntas pendientes no muestran soluciones inventadas.
- Probar login, navegación, repaso, sincronización y PWA en un móvil.
- Completar posteriormente los seis modelos escaneados de Mercancías; el examen principal
  de Viajeros ya tiene sus 100 preguntas, pero solo parte de sus respuestas cotejadas.

La rama permite avanzar sin interrumpir producción. No publicar un examen
como «100 preguntas corregidas» si parte de sus soluciones siguen pendientes.
