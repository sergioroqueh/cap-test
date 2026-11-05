# CAP Test 2026 — R21: primera pasada de TODOS los exámenes y marcas por pregunta

Fecha: 05/11/2026 · Rama `feat/examenes-cap-auditoria-2026-11` · PR #6 **draft** · `main` intacta.

## Alcance real

R21 realiza una **criba automática, reproducible y no destructiva, de las 2.600 preguntas de los 26 exámenes** (25 Mercancías y 1 Viajeros). Añade una vista de auditoría que permite escoger **cada convocatoria**, abrir sus 100 enunciados y sus cuatro opciones, ver la letra impresa, la vinculada, el banco y la nota aplicada, y filtrar únicamente las marcadas. Incluye ahora los cuatro modelos sin plantilla (solo consulta: siguen fuera de los modos históricos puntuables).

NO afirmar que un cribado automatizado significa que alguien ha contrastado visualmente las 2.600 preguntas. NO equiparar «sin segunda corroboración» a «respuesta incorrecta». El contraste visual completo será trabajo posterior.

## Recuentos reales del cribado con GitHub Actions

| Indicador | Conteo |
|---|---:|
| Convocatorias cubiertas / preguntas | 26 / 2.600 |
| Preguntas marcadas con algún aviso | **774** |
| Sin alerta automática detectada (no implica validación visual) | **1.826** |
| P0 — conflictos graves | **3** |
| P1 — texto/numeración a revisar | **249** |
| P2 — falta de segunda corroboración del banco | **417** |
| P3 — sin plantilla y sin clave (resto de marcas con prioridad superior, aparte) | **105** |
| Glifos dudosos por posible OCR o capa de texto | **189 marcas** |
| Texto inusualmente corto / posible incompletitud | **4 marcas** |
| Alternativas reconstruidas por fallos del extractor | **6 marcas** |
| Desfase julio 2023 A | **57 marcas** |
| Respuesta impresa sin correspondencia independiente en el banco | **504 marcas** |
| Faltan claves por plantilla ausente | **180 marcas** |
| Nuevos conflictos entre plantillas de modelos repetidos exactamente | **0** |
| Cambios en letras originales / puntuación | **0 / 0** |

Las categorías de marcas pueden solaparse en una pregunta; la tabla P0–P4 cuenta cada pregunta **una sola vez por su prioridad máxima**. Por ejemplo, algunas de las 180 sin plantilla también llevan un aviso de texto y quedan clasificadas P1, no P3.

El algoritmo utiliza enunciado y las cuatro opciones (normalización independiente del orden) para cotejos entre modelos de la **misma modalidad**. Cuando dos hojas oficiales dan soluciones diferentes para una pregunta exactamente repetida, se crea marca P0 sin cambiar ninguna clave; en R21 hubo cero casos nuevos. Se conserva el modelo original A/B, fecha, categoría, número y página para evitar falsos duplicados por reservas y ampliaciones.

## Hallazgos iniciales sustentados

### 1. Mercancías Global 27/09/2025 — empezar por aquí
Solo **30 de 100** soluciones de su plantilla tenían coincidencia comparable con el banco original en la fuente R19. El texto extraído del PDF contiene ejemplos como «EI origen», «Ios animaIes» y «VehícuIo» (I mayúscula confundida con l minúscula). Esto pone en duda la *fidelidad del texto extraído*, no la lectura de 100 letras de la plantilla. La q1 está anotada expresamente. El cribado busca estos patrones en todas las convocatorias y produce 189 marcas.

### 2. Mercancías Global 26/11/2022 — revisar segundo
El cotejo documental inicial tiene **55 coincidencias** con el banco, menor proporción que la mayoría de convocatorias. Las 45 restantes NO se declaran incorrectas; se propone cotejar sus enunciados/opciones y la plantilla frente al documento original. Es posible que sean preguntas ausentes del banco.

### 3. Seis reparaciones de transcripción previamente documentadas
El archivo `data-src/cap-exams/override_transcriptions_review.json` confirma exactamente estas seis preguntas en que el extractor perdió o unió una letra identificadora de alternativa. R21 comprueba que su texto y sus opciones siguen coincidiendo con los registros corregidos y las marca P1 por separado:

- 04/02/2023 Mercancías Global: **q9, q17, q82**, páginas 239, 241 y 255.
- 01/02/2025 Mercancías Global: **q22, q57**, páginas 262 y 267.
- 03/06/2023 Mercancías Global: **q97**, página 311.

El reemplazo del extractor NO equivale a verificación visual definitiva. No se cambia respuesta alguna.

### 4. Tres conflictos P0, siempre sin puntuación
- 26/07/2025 Mercancías A q43: plantilla A vs banco B.
- 07/02/2026 Mercancías Global q61: plantilla A vs banco C (Reglamento UE 165/2014 art. 36.1.ii exige tarjeta si posee una).
- 28/03/2026 Mercancías Global q43: plantilla C vs banco B; **imagen de la página 355 revisada en R20** confirma que el enunciado sobre circulación sanguínea resulta incongruente con las cuatro alternativas. Se añade marca explícita `enunciado_fuente_incoherente`. Mantener en examen sin sumar error/acierto.

### 5. Desfase 29/07/2023 Mercancías A
Los originales preservan 100 letras impresas; q44–99 necesitan la fila n+1 y q100 no tiene fila 101. R21 marca 57 casos de correspondencia especial, sin cambiar ni una letra, y preserva las 13 soluciones editoriales ya respaldadas en R18.

## Archivos nuevos y uso

- `scripts/build_editorial_triage_r21.py`: genera el inventario desde los JSON derivados de la build. Nunca escribe sobre los ficheros originales ni sobre `correctAnswer`.
- `public/data/exams/editorial_triage_r21.json`: resultado compilado con 26 listas de 100 preguntas, prioridad, motivo, evidencia y página fuente.
- `public/data/exams/editorial_triage_r21.csv`: exportación con **las 2.600 preguntas, enunciado, opciones A-D, letra original, letra vinculada, banco, clave aplicada y marcas**, apta para cotejo manual.
- `src/capExams.ts` y `src/App.tsx`: cargan la auditoría. La portada puede seleccionar cualquier modelo de las dos modalidades, ver estado P0–P4 por convocatoria, filtrar casos marcados y consultar opciones.
- `src/styles.css`: anotaciones discretas en móvil/tema oscuro.
- `scripts/test_exam_data.py`: verifica 2.600 filas, 26 grupos, etiquetas de conflictos y reparaciones, no alteración de notas y ausencia de respuestas «inventadas» dentro de las marcas.
- `.github/workflows/ci.yml`: incorpora JSON y CSV nuevos al artefacto `cap-exam-review`.

## Plan corto de revisión editorial de aquí a completar convocatorias

**R22 — Lote de prioridad alta:** examinar exhaustivamente las filas P0/P1 de septiembre 2025, noviembre 2022 y julio 2023 A, más los seis fallos de extractor de otras fechas; inspeccionar imágenes originales cuando estén disponibles. Registrar para cada caso `confirmada`, `dudosa`, `transcripción incorrecta`, `conflicto no resuelto`, fuente, foto/página y motivo. Nunca editar el banco de 8.655 ni la letra impresa.

**R23 — 2025–2026 restantes:** revisar por convocatoria las filas marcadas de febrero/marzo/mayo/julio/septiembre 2025–2026, poniendo énfasis en textos visuales y claves sin equivalencia exacta en el banco.

**R24 — 2022–2024 restantes y Viajeros:** revisar las demás convocatorias y cerrar la lista pendiente; decidir de forma individual qué se puede usar para estudiar con seguridad. Las 180 respuestas sin plantilla continuarán aplazadas salvo evidencia nueva inequívoca. No suponer que P4 significa «100 preguntas comprobadas visualmente».

En todas las rondas: verificar HEAD/main, CI, beta y PR #6 draft. La validación real de navegación en PC/móvil sigue siendo distinta del build automático. **No fusionar a main sin autorización del usuario**.
