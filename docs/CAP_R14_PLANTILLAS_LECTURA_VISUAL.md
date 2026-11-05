# CAP Test — R14: priorizar solo exámenes con plantilla (05/11/2026)

## Criterio del usuario
- Aplazar exámenes que no tengan archivo de plantilla de respuestas identificado.
- Interpretar las letras provisionales **leyendo visualmente el PDF de la plantilla**.
- Pasar a respuesta definitiva solo cuando se verifique sin ambigüedad la casilla y su correspondencia con la pregunta real.
- No sustituir una lectura visual fallida por la confianza en el banco, por similitud textual ni por una extracción automática.

## Estado reproducible
- 26 modelos principales y 2.600 apariciones históricas.
- 1.922 respuestas utilizables del estado anterior (1.915 cotejadas con banco + 7 documentadas con fuentes oficiales externas, con revisión editorial).
- **678 apariciones sin autocorrección**.
- **498 pendientes en 22 exámenes con archivo de plantilla identificado** (no significa que el archivo esté accesible en este entorno).
- **180 pendientes en 4 exámenes sin plantilla**: Mercancías 21/05/2022 (65), Mercancías 02/12/2023 (76), Mercancías B 26/07/2025 (15), Viajeros 06/04/2024 (24). Estas se aplazan de la ronda editorial; se conservan en el banco y en la app.
- La cola prioritaria se exporta a `template_review_priority.csv`, la aplazada a `without_template_deferred.csv`; resumen `template_review_summary.json`.

## Comprobación adicional de plantilla oficial del 29/03/2025
Fuente identificada por fecha y modalidad: [Plantillas correctoras, segunda prueba CAP 2025, Castilla-La Mancha](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250331/2a_prueba_cap_2025_-_plantillas_correctoras.pdf), bloque «MERCANCÍAS GLOBAL».

La extracción de texto del PDF público ha permitido obtener una secuencia candidata de 100 letras, pero **el visor no ha permitido leer visualmente las casillas**. No se ha obtenido el PDF original a través de un medio que permita inspección manual en esta ejecución. Comparación conservadora con las 100 preguntas originales incorporadas:

- 76 coincidencias con las 85 respuestas recuperadas del banco.
- **9 contradicciones entre banco y secuencia textual**: preguntas 25, 46, 62, 69, 70, 80, 82, 90 y 100.
- 15 preguntas sin respuesta en el banco, con letra extraída pero **no aprobada**.
- Algunas contradicciones son especialmente graves: p. ej., la 62 pregunta por la unidad de par motor (el banco marca Nm, mientras la extracción apunta a CV), y la 100 pregunta si las revoluciones del motor son iguales a las de las ruedas (el banco marca No; la extracción, Sí). Esto impide fiarse de la lectura textual.
- **Cero respuestas promocionadas a definitivas** hasta poder inspeccionar la imagen, la página y la numeración original.
- La secuencia provisional está aislada en `data-src/cap-exams/official_template_extraction_unverified_2025_03_29.json`, **no** en el fichero de plantillas aprobadas; discrepancias detalladas en `template_2025_03_29_unverified_comparison.json`.

## Paso desbloqueante
Para cotejar *de verdad* las 22 plantillas identificadas, recuperar el archivo fuente del usuario `Respuestas.zip` con los PDF originales. **Su nombre consta en el contexto histórico, pero sus bytes no están actualmente disponibles en este entorno**. Si se recibe de nuevo, comprobar por cada examen:
1. Modalidad y modelo exactos (A, B, Global, Mercancías / Viajeros).
2. Numeración de las preguntas principales 1–100, sin reservas ni ampliaciones.
3. Lectura visual de cada casilla A/B/C/D, con página y fuente.
4. Divergencias con el banco y modelos repetidos; no aprobar conflictos sin resolución.
5. Incorporación de las claves realmente verificadas con procedencia, pruebas e historial, preservando banco maestro y producción.

**PR #6 debe seguir en borrador. No introducir respuestas definitivas deducidas del reconocimiento automático.**
