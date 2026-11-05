# CAP Test 2026 — R22 | Revisión dirigida examen a examen y correcciones no destructivas

Fecha: 05/11/2026. Rama de pruebas `feat/examenes-cap-auditoria-2026-11`; PR #6 (draft); **`main` no modificado**.

## Balance, sin atribuir una verificación que no se ha hecho

- **Tres convocatorias trabajadas**, con sus **300 preguntas** en una nueva ficha exportable: 27 observaciones individuales, 273 filas cuyo cotejo editorial individual sigue pendiente. Además se incorporan **6 alternativas reconstruidas de otras fechas**, total del expediente **306 filas y 33 observaciones particulares**.
- **Septiembre de 2025:** 94 preguntas con correcciones **reversibles de texto**, con copia íntegra de la extracción original y referencia al PDF oficial JCCM. Las q1–q6 han podido contrastarse documentalmente con el texto público del examen; eso no equivale a auditar las otras 94 en la imagen de cada página.
- **Noviembre de 2022:** 10 preguntas con revisión técnica preliminar. La **q6 pasa a «dudosa frente a DGT»**; no se cambia la letra original A ni se inventa otra. Una corrección tipográfica adicional en q17 («Ilama» → «llama») conserva el texto fuente.
- **Julio de 2023 modelo A:** diez casos de correspondencia n+1 revisitados, más q100 expresamente marcado sin casilla 101. Cuatro reparaciones tipográficas puntuales (q45, q48, q60, q73), con texto anterior disponible.
- Las seis alternativas reconstruidas anteriormente (febrero 2023 q9/q17/q82, febrero 2025 q22/q57, junio 2023 q97) quedan marcadas individualmente como **pendientes de inspección de la imagen fuente**, nunca como aprobadas.
- Estado global **intacto**: 26 exámenes, 2.600 preguntas, 22 PDF de plantilla, 2.200 letras originales, 2.417 puntuables, 3 conflictos originales sin puntuación y 180 sin plantilla aplazadas. Las dos modalidades permanecen separadas.

### Ficha por convocatoria

| Examen | 100 preguntas en expediente | Casos individuales | Correcciones reversibles de texto | Situación principal |
|---|---:|---:|---:|---|
| Mercancías Global 27/09/2025 | 100 | 6 | **94** | Texto PDF deteriorado (I mayúscula por l) y q3 con preposición distinta de la fuente pública |
| Mercancías Global 26/11/2022 | 100 | 10 | **1** | Solo 55 coincidencias previas con el banco; q6 técnicamente dudosa |
| Mercancías A 29/07/2023 | 100 | 11 | **4** | Desfase documentado 44–99, 13 claves editoriales previas, q100 sin casilla 101 |
| Reparaciones ajenas a esas tres fechas | +6 | 6 | 0 | Restauraciones de etiquetas A–D sin revisión visual final |

Los casos de **coherencia técnica preliminar** no se confunden con verificación normativa externa. Las marcas P4 del cribado R21 no equivalen a «contenido aprobado visualmente».

## Hallazgo de respuesta dudosa — 26/11/2022, pregunta 6

El examen dice: «En los camiones, la caja de cambios o caja de velocidades es el elemento encargado de:»

- **A (plantilla original):** «conectar el motor con el sistema de transmisión».
- La DGT distingue, en el manual de Mecánica 2022, que el **embrague** permite acoplar o desacoplar el motor, mientras que la **caja de cambios** modifica la relación de transmisión para adaptar velocidad y par.
- Las otras tres alternativas no ofrecen la definición exacta de caja de cambios.

**Decisión R22:** marcar `DUDOSA_TECNICA_FRENTE_DGT`, prioridad P0 de revisión, con fundamento externo. **No** sustituir A por otra letra, ni afirmar que sea una errata de la plantilla sin evidencia oficial de rectificación. La pregunta conserva provisionalmente su puntuación histórica hasta decidir expresamente si debe bloquearse en una ronda editorial. El conteo de **4 P0** ahora representa 3 conflictos sin puntuar + esta duda técnica *aún puntuable*.

Fuente: [DGT Manual VIII Mecánica, edición 2022](https://sede.dgt.gob.es/.galleries/permisos-de-conducir/certificacion-aptitud-profesores-formacion-vial/2022/Manual-VIII-Mecanica-2022.pdf), tema 7 «Sistema de transmisión», apartados 2 y 3. El manual distingue embrague y caja de velocidades; la cita no es una supuesta plantilla rectificada del examen CAP.

## 27/09/2025: recuperación de texto de la fuente oficial

PDF JCCM: [Cuestionario 5ª prueba 2025](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250929/cap_2025_5a_cuestionarios.pdf) (Mercancías Global, primeras 18 páginas de cuestionario).

Se han comprobado ejemplos q1 «El origen y el propietario de los animales», q2 «Vehículo jaula» y q3 «En razón **de** la especificidad de su objeto». La extracción del PDF histórico guardada en GitHub decía «EI origen...», «VehícuIo» y «En razón **a** ...». R22 utiliza una normalización precisa y limitada de glifos `I/l`, con excepción para nombres que empiezan por I real (como Isotermo), y un reemplazo específico de la preposición de q3. **94/100 preguntas resultaron afectadas**.

Cada pregunta normalizada guarda `textCorrection.originalQuestion`, `textCorrection.originalOptions`, método, página, URL de fuente y estado `correccion_mecanica_cotejar_con_imagen_individual`. El algoritmo corrige la visualización **después de calcular las claves, su cotejo con el banco y la frecuencia**, por lo que no se reescriben respuestas, reglas de correspondencia ni digestos de la fuente.

Los pies de página existentes en el texto bruto se excluyen ya en `scripts/build_exam_data.py` mediante el filtro de cabeceras/paginación. No se publican como una supuesta respuesta errónea solo por aparecer en una extracción ingenua.

## 29/07/2023, modelo A

Se conservan las 100 casillas impresas de su plantilla, **56 posiciones n+1** desde q44–99 y q100 sin mapeo (57 incidencias en total). Se han reanalizado diez preguntas con respuesta plausible en la fila siguiente: q44 B (enfermedad no profesional), q47 A (tomador), q48 B (paso a nivel ferroviario), q49 C (consumo específico), q61 C (unidad de par), q73 D (tasa de alcohol), q76 A (resistencias), q89 D (prevención laboral), q94 B (distancia al ciclista) y q99 C (infracciones de circulación). No se ha localizado una fe de erratas oficial que explique el desplazamiento; **no se cambia la letra original ni se aprueba por número equivocado**.

La q100 mantiene su vínculo con el banco si lo tiene, pero **sin fingir que existe la casilla 101**.

## Implementación en rama de pruebas

- `scripts/build_exam_data.py`: 94 normalizaciones controladas septiembre 2025 y cinco cambios tipográficos puntuales 2022/2023, cada uno reversible con fuente anterior. **No cambia ningún `correctAnswer`, `originalSheetAnswer` ni `answerStatus`.**
- `data-src/cap-exams/r22_editorial_casebook.json`: 33 casos originales, clasificación y justificación.
- `scripts/build_editorial_casebook_r22.py`: 300 preguntas dirigidas + 6 reconstrucciones, guardas de claves, desfase, página, transcripción y fuentes.
- `public/data/exams/editorial_casebook_r22.csv` / `.json`: productos derivados, no se editan manualmente.
- `src/capExams.ts`, `src/App.tsx`, `src/styles.css`: el visor por convocatoria muestra casos R22, DUDOSA, estado de contraste, texto antes/después y CSV descargable.
- `scripts/build_editorial_triage_r21.py`: agrega banderas y evidencia R22, con **4 P0**.
- `scripts/test_exam_data.py`: comprobaciones de integridad R22.

## Beta y límites

CI GitHub Actions comprueba `npm run build` (incluye `tsc`), `scripts/test_exam_data.py`, fuentes, 2.600 preguntas y artefactos de auditoría. Vercel despliega la rama en **proyecto de beta aislado**. Estado exacto/HEAD final de CI y Vercel se debe recoger al terminar el último commit. `READY` significa que hay build desplegada, **no** que la navegación manual en teléfono/escritorio haya sido realizada.

Mantener **PR #6 draft**; no editar ni fusionar `main` sin aprobación.

## Siguiente ronda R23

Revisar con este mismo esquema el resto de modelos **2025–2026**, examinando q por q las marcas de mayor riesgo. Especial atención al contraste entre fuentes en julio 2025 A q43, febrero 2026 q61 y marzo 2026 q43 (las tres continúan sin puntuar), a textos escaneados y a normativa actualizada. Clasificar `duda normativa`, `transcripción corregida`, `error de clave comprobado` y `no comprobable`; nunca decidir por una coincidencia de letras aislada. Crear expediente exportable con todos los modelos trabajados y nueva continuidad. R24: terminar 2022–2024 y Viajeros; luego auditoría global de salida.