# CAP Test 2026 — R23: revisión por convocatoria de los modelos 2025–2026 restantes

Fecha: 05/11/2026. Repositorio `sergioroqueh/cap-test`. Rama `feat/examenes-cap-auditoria-2026-11`, PR #6 **draft**. **No se modifica `main`.**

## Qué se ha hecho y qué no

R23 crea un expediente de **10 convocatorias, 1.000 preguntas y cuatro alternativas A–D por pregunta**, y añade **17 incidencias justificadas** con fuente y motivo. Cada posición se registra en CSV para revisión manual y aparece en la beta. Se examinan sistemáticamente los metadatos, la procedencia, las claves, la relación con el banco, las advertencias anteriores y los estados de transcripción.

**Importante:** esta pasada NO representa una comprobación visual individual y completa de 1.000 preguntas. Las filas no contrastadas visualmente conservan el estado `COTEJO_EDITORIAL_INDIVIDUAL_PENDIENTE` o `TEXTO_VISUAL_PROVISIONAL_PENDIENTE_COTEJO`. El estado `LECTURA_EXTERNA_NO_VERIFICADA_DISCREPA` NO significa que la plantilla oficial esté mal. El estado `EXPLICACION_DGT_EXTERNA_COTEJADA` confirma una explicación concreta, NO todas las alternativas del examen.

## Inventario auditable

| Fecha | Modelo Mercancías | Páginas PDF compuesto | Plantilla | Puntuables | Sin puntuación | Incidencias R23 |
|---|---|---|---|---:|---:|---:|
| 01/02/2025 | Global | 259–274 | Sí | 100 | 0 | 2 reconstrucciones de opciones (q22, q57) |
| 29/03/2025 | Global | 332–347 | Sí | 100 | 0 | 9 letras discrepantes en lectura **no verificada** |
| 26/07/2025 | A | 97–111 | Sí | 99 | 1 | q12 grafía original, q43 conflicto bloqueado |
| 26/07/2025 | B | 185–201 | **No** | 85 | 15 | q83 repite la q43 de A sin plantilla B |
| 07/02/2026 | Global | 275–290 | Sí | 99 | 1 | q61 normativa vs clave, bloqueada |
| 28/03/2026 | Global | 348–363 | Sí | 99 | 1 | q43 enunciado incoherente; q58 pictograma DGT |
| 30/05/2026 | Global | 404–419 | Sí | 100 | 0 | Ningún conflicto adicional verificado |
| 25/07/2026 | A | 112–127 | Sí | 100 | 0 | Ningún conflicto adicional verificado |
| 25/07/2026 | B | 202–217 | Sí | 100 | 0 | Ningún conflicto adicional verificado |
| 26/09/2026 | A | 128–144 | Sí | 100 | 0 | Ningún conflicto adicional verificado |
| **TOTAL R23** | **10 exámenes** | | **9 plantillas** | **982** | **18** | **17 casos** |

«Ningún conflicto adicional verificado» significa que el cribado y la evidencia disponible no han permitido probar otro error. No equivale a una revisión manual completa ni a descartar errores nuevos.

## Incidencias verificables destacadas

### 1. Mercancías Global 29/03/2025 — nueve casillas de una segunda lectura NO verificada

El documento de fuente `official_template_extraction_unverified_2025_03_29.json` contiene una extracción textual alternativa de la plantilla pública JCCM fechada 31/03/2025, etiquetada expresamente `PROVISIONAL_BLOQUEADO_NO_PUBLICAR_COMO_PLANTILLA_VERIFICADA`. Se ha comparado su secuencia con las 100 letras ya cotejadas visualmente y conservadas en `answer_keys_visually_verified.json`.

| Pregunta | Lectura externa no verificada | Plantilla original verificada |
|---|:---:|:---:|
| 25 | A | C |
| 46 | D | B |
| 62 | A | C |
| 69 | C | A |
| 70 | D | C |
| 80 | A | B |
| 82 | A | C |
| 90 | A | C |
| 100 | A | B |

**Decisión:** mantener la letra original verificada y señalar cada fila como `LECTURA_EXTERNA_NO_VERIFICADA_DISCREPA` (P1). No promocionar la extracción alternativa ni calificarla como «nueve fallos oficiales». Fuente candidata: [JCCM 2ª prueba CAP 2025 — plantilla](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250331/2a_prueba_cap_2025_-_plantillas_correctoras.pdf). El cuestionario público permite cotejar su enunciado original: [JCCM, 29/03/2025](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250331/2a_prueba_cap_2025_-_cuestionarios.pdf). No se ha logrado inspeccionar visualmente de nuevo esas nueve casillas desde el visor web en esta sesión.

### 2. Mercancías A y B 26/07/2025 — la misma pregunta no resuelve el conflicto

El PDF público de la [4ª prueba CAP 2025](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250728/2025_cap_4a_prueba_cuestionarios.pdf) contiene **q43 del modelo A y q83 del modelo B**, ambas con el mismo enunciado de ordenar motores de mayor a menor consumo específico y el mismo conjunto de cuatro opciones.

- Modelo A q43: plantilla original A, banco B, sigue **sin puntuar**.
- Modelo B q83: falta la **plantilla original B**; una repetición idéntica del texto no permite afirmar que B tenga letra oficial B/A ni resolver el conflicto del modelo A.
- Modelo A q12: el propio cuestionario público imprime la variante «Capitóné» donde debería leerse «capitoné». Se deja **marcada como posible errata del documento fuente**, no se altera el texto original sin inspección visual ni se afecta la puntuación.

### 3. Mercancías Global 07/02/2026, q61 — contradicción normativa preservada

**Fuente oficial:** [Reglamento UE 165/2014, art. 36.1.ii](https://eur-lex.europa.eu/eli/reg/2014/165/oj/spa), versión consolidada vigente disponible en EUR-Lex. Para tacógrafo analógico, exige presentar la tarjeta del conductor **si posee una**. La plantilla A «sí, siempre» frente a C del banco («si posee una») continúa bloqueada sin puntuación, sin borrar la letra original.

### 4. Mercancías Global 28/03/2026, q43 y q58

- q43: la imagen del PDF fuente ya examinada en R20 evidencia una pregunta sobre circulación sanguínea acompañada de alternativas sobre otros riesgos. Plantilla C frente a banco B; **sin puntuación** hasta nueva prueba inequívoca.
- q58: el pictograma triangular rojo con un automóvil en el envase de un medicamento **advierte sobre posibles efectos en la conducción** y remite al prospecto, no prohíbe automáticamente conducir. [Material oficial DGT](https://www.dgt.es/export/sites/web-DGT/.galleries/downloads/muevete-con-seguridad/evita-conductas-riesgo/Medicamentos_conduccion_PoblacionGeneral.pdf). Se incorpora la evidencia como apoyo explicativo, sin cambiar clave.

### 5. Mercancías Global 01/02/2025, q22 y q57

El expediente anterior `override_transcriptions_review.json` ya documentó que el extractor había omitido la etiqueta de la alternativa C. R23 arrastra el estado **reconstrucción pendiente de verificación de imagen**, sin darlo por resuelto ni cambiar las cuatro alternativas.

## Implementación en el repositorio

- `data-src/cap-exams/r23_editorial_cases.json`: **17 incidencias** individualizadas, categoría, motivo, grado de prueba y fuente original, con `changesAnswer=false`.
- `scripts/build_editorial_casebook_r23.py`: genera `editorial_casebook_r23.json` y `.csv` sobre 1.000 posiciones con textos, alternativas, página, plantilla, clave, banco, estado, prioridades y evidencia. Comprueba la lista exacta de 9 discrepancias, q43 de julio A frente q83 de julio B, q61 febrero, q43 marzo y los totales.
- `src/capExams.ts`, `src/App.tsx`, `src/styles.css`: panel de auditoría con incidencias R23 y exportación directa desde la beta.
- `scripts/test_exam_data.py`: 1.000 filas distintas, 10 modelos de 100, 900 letras impresas, 982 puntuables, 18 sin puntuar, 17 evidencias, cero modificaciones a claves y cero aprobaciones visuales generales inventadas.
- `package.json`: incorpora compilador R23 a `prepare:data`.
- `.github/workflows/ci.yml`: archiva JSON y CSV R23 en `cap-exam-review`.

El archivo CSV exportable es la **lista de trabajo que permite marcar preguntas tras revisión manual**, no una lista de 1.000 errores.

## Integridad de todo CAP Test preservada

- **26** exámenes principales, **2.600** apariciones, sin reservas ni ampliaciones duplicadas.
- **22** plantillas de respuestas, **2.200** letras originales con SHA/casilla.
- **2.417** respuestas puntuables; **183** sin puntuación: **3** conflictos documentados + **180** sin plantilla.
- **8.655** preguntas originales y **33** cuestionarios del banco general intactos.
- La duda técnica de noviembre 2022 q6 **permanece marcada** como P0, pero por ahora conserva la calificación original; requiere decisión editorial específica.
- No se publica la rama ni se fusiona PR #6 a `main` sin autorización.

## Para R24

Terminar el grupo de modelos **2022–2024 y Viajeros** no revisados específicamente en R22/R23. Generar el expediente de las 13 convocatorias restantes y marcar dudas de contenido, transcripción o clave de forma individual. Después realizar auditoría global de unión R22+R23+R24 (26 modelos / 2.600) y repasar visualmente prioridades críticas. Mantener las cuatro plantillas no disponibles como pendientes, sin inventar respuestas. Verificar CI y beta, hacer entrega de nuevo TXT y continuidad sin tocar `main`.

El estado exacto del HEAD, CI y preview de R23 se añadirá al TXT de cierre, tras terminar la última compilación y el despliegue.