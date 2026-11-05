# CAP Test 2026 — R17: incorporación masiva de las 22 plantillas (05/11/2026)

## Resultado verificado
- Banco histórico: **26 exámenes completos, 2.600 preguntas**.
- Banco general original: **8.655 preguntas y 33 cuestionarios, intactos**.
- **2.404 preguntas puntuables**, frente a 2.039 al inicio de R17: **365 recuperadas**.
- **196 sin autocorrección**: **16 de exámenes con plantilla**, **180 de cuatro exámenes sin archivo de respuestas** (aplazados).
- De los 22 exámenes con plantilla PDF original: **21 con correspondencia íntegra de 100/100 preguntas** y **julio de 2023 modelo A con solo 43 preguntas asociadas de forma inequívoca** (véase incidencia).
- **2.143 casillas** respaldadas por lectura de la plantilla original y enlazadas de forma fiable a una posición del examen: 21×100 + 43. De estas, 3 conservan conflicto documental, luego **2.140 posiciones con estado «plantilla_pdf_oficial_verificada»**.
- La respuesta del banco puede seguir puntuándose en otras preguntas sin hoja verificada; «puntuable» no significa que las 2.404 tengan validación de plantilla oficial.

## Cómo se realizó
1. Se extrajo el ZIP original `Respuestas(1).zip`, 22 PDF.
2. Para 15 plantillas tipo tabla, se hizo una lectura independiente de las letras en la propia imagen del PDF; **14 coincidieron 100/100 con la transcripción previa**. Para julio de 2023 modelo B, la imagen revela que las letras **6, 13 y 19 son D** (antes se habían extraído C).
3. La plantilla «A Septiembre 2026» (5 páginas) se trató como formulario de casillas rellenas. La página 2 contiene el examen **Mercancías Global, modelo A**; se leyeron las **100 casillas principales** con separación de las reservas y de las modalidades ajenas. No se observaron marcas ambiguas.
4. Las seis plantillas verificadas en las rondas anteriores se preservaron sin cambios.
5. Se auditó la unión con el banco original por posición y letra; **1.543 posiciones nuevas cotejadas sin contradicciones con el banco** (1.500 de quince exámenes completos + 43 del modelo A 2023), con **365 recuperaciones netas**. Se comprobó el fichero de origen, SHA-256 de cada PDF, el modelo y la categoría.
6. La importación separa la fuente visual de las claves provisionales; valida en compilación que ninguna de las 16 claves cambie frente al cotejo anterior salvo las tres correcciones documentadas de julio de 2023 B.

## Conflictos y excepciones que NO se convalidan automáticamente
- **Julio 2023, Mercancías, modelo A:** la correspondencia coincide sin desplazamiento solo hasta la pregunta **43**. Para la 44–99 existe un desplazamiento +1 apoyado en 22 coincidencias de otros modelos, pero no certificado por revisión de numeración original; la pregunta 100 tampoco tiene correspondencia posicional de plantilla fiable. Se preserva la corrección provisional y no se etiquetan como «plantilla verificada». **De los 196 pendientes globales, 16 corresponden a exámenes que sí tienen plantilla**, asociados a esta incidencia de alineación y a los conflictos siguientes.
- **Julio 2025 A, pregunta 43:** conflicto entre PDF de plantilla y transcripción/banco. Se conserva sin calificar.
- **Febrero 2026, pregunta 61:** PDF marca A; banco/normativa sugieren C. Se conserva sin calificar.
- **Marzo 2026, pregunta 43:** conflicto entre plantilla y texto transcrito. Se conserva sin calificar.
- **Sin plantilla:** Mercancías mayo de 2022, Mercancías diciembre de 2023, Mercancías julio de 2025 B y Viajeros abril de 2024: **180 respuestas pendientes**, al final según indicación del usuario.
- En exámenes escaneados cuya **transcripción de preguntas** sea provisional, el aviso editorial permanece aunque la **clave de plantilla** esté confirmada.

## Archivos técnicos y seguridad
- `data-src/cap-exams/answer_keys_visually_verified.json`: seis PDF previamente cotejados.
- `data-src/cap-exams/visual_batch_candidates_2026_11_05.json`: 16 PDF adicionales con su nombre, SHA-256, secuencia de 100 respuestas y límite posicional seguro.
- `scripts/build_exam_data.py`: aplicación con control de conflictos, consistencia de plantilla, modelo, modalidad y desfase parcial.
- `scripts/build_template_review.py`: genera `template_review_priority.csv` (16) y `without_template_deferred.csv` (180).
- `scripts/test_exam_data.py`: prueba los 26 modelos, original 8.655/33, 2.404 respuestas puntuables, 365 recuperaciones, tres conflictos bloqueados y alineación parcial.
- `scripts/audit_visual_batch_candidates.py`: informe por PDF y recuento de coincidencias/recuperaciones. En el entorno final, algunas recuperaciones ya figuran puntuables, por lo que se informa por separado de las 365 incorporaciones respecto a R16.
- PR #6 continúa **borrador**, independiente de `main`; no hay fusión automática de datos a producción.

## Estado final R17
CI: [GitHub Actions](https://github.com/sergioroqueh/cap-test/actions/runs/42009899576) (ejecución satisfactoria de las pruebas del lote). Mantener revisión final en ordenador y móvil antes de publicar.
