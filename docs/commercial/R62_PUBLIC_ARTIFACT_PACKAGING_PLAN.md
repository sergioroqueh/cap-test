# RutaCAP — R62: plan de empaquetado web mínimo y validación previa

Fecha: 19/11/2026
Repositorio: sergioroqueh/cap-test (visibilidad GitHub: público)
Rama: feat/cap-commercial; PR #21 OPEN DRAFT
HEAD base auditado: e16c608a1048ed737cfed74a1c553a509fc8b801

**Alcance de R62:** solo auditoría y diseño. No se ha cambiado el empaquetado, ni los datos, ni las respuestas, ni la puntuación, ni la protección de Vercel. No se ha ejecutado despliegue.

## Estado reproducible de compilación

`package.json` define `build:preview` como:
`npm run prepare:data && tsc -b && vite build --mode cap-preview`.
El generador portátil encadena los scripts de preparación Python y genera en `public/data`.
`vite.config.ts` copia `public/` a `dist/` mediante comportamiento estándar de Vite; actualmente solo rechaza nombres que coincidan con `^RutaCAP_.*(?:privad|ensayo|importacion)`, no todas las rutas editoriales.

No hay ejecuciones de GitHub Actions para el SHA base R61. Se intentó `git ls-remote` desde el contenedor y falló por DNS (`Could not resolve host: github.com`), de manera que **no se ha compilado** ese SHA ni se dispone de resultados TypeScript/Chromium para R61. El check de comentarios de Vercel no es una prueba de build.

## Dependencias de la app distribuida (candidatos a conservar)

Se revisaron `src/data.ts`, `src/capExams.ts`, `src/App.tsx`, `src/main.tsx` y `public/sw.js`, además de otros consumidores del frontend.

- `data/index.json` y las rutas `data/questions/*.json` enumeradas por dicho índice: banco general, 8.655 preguntas en 33 cuestionarios.
- `data/exams/index.json` y las rutas `data/exams/questions/*.json` enumeradas por dicho índice: 26 modelos históricos, incluidos modelos todavía no habilitados para examen. No modificar su contenido ni la elegibilidad.
- `data/exams/frequency_by_bank.json`: frecuencias en las vistas del banco y precarga del service worker.
- `index.html`, archivos Vite `assets/`, `icon.svg`, `manifest.webmanifest`, `sw.js` y restantes activos estáticos estrictamente requeridos por la UI y el servicio PWA.

Las preguntas históricas ya incluyen decisiones técnicas y trazabilidad en sus registros; no depender de que se descarguen informes editoriales independientes para que la app puntúe correctamente.

## Fuera de la distribución del alumno (candidatos a excluir SOLO de dist)

Los siguientes productos de compilación se generan bajo `public/data/exams/` para verificaciones, revisión y exportaciones. No deben borrarse de `public/` durante la preparación, porque otros generadores y pruebas los leen:

- `editorial_triage_r21.{json,csv}`, `editorial_casebook_r22.{json,csv}`, `editorial_casebook_r23.{json,csv}`, `editorial_casebook_r24.{json,csv}`, `editorial_progress_r24.json`, `editorial_decisions_r25_three.{json,csv}`.
- `sheet_audit_index.json`, `sheet_audit_2400.csv`, `convocatorias_auditoria_r20.{json,csv}`.
- `review_queue.{json,csv}`, `review_hints.{json,csv}`, `cross_model_pending_review.{json,csv}`, expedientes de alineación, OCR, plantilla y selección.
- `technical_review_r27*`, `technical_review_r28*`, `technical_review_r29*`, `technical_review_r30*`, `technical_review_r31*` y candidatos/colas asociadas.

La lista anterior no sustituye un inventario automático de `dist/data`: cualquier archivo no reconocido debe producir fallo de empaquetado, no publicarse por omisión. Los lectores `loadCapEditorialTriage`, `loadCapR22Casebook`, `loadCapR23Casebook`, `loadCapR24Casebook`, `loadCapSheetReview` permanecen para herramientas de desarrollo; el panel solo existe en `import.meta.env.DEV`. Si esos lectores se invocan fuera de desarrollo, la falta de los informes es un error y debe detectarse.

## Diseño propuesto para R63 (no ejecutado)

1. Conservar `npm run prepare:data` completo y verificaciones de fuentes. Después de `vite build`, en el mismo pipeline de construcción, ejecutar un **empaquetador de `dist/data` con allowlist explícita** que nunca modifique `public/`, `data-src/` ni las fuentes.
2. Validar rutas de `data/index.json` y `data/exams/index.json`: nombres relativos esperados, sin `..` ni rutas externas, integridad de las 33 y 26 rutas, existencias y número de preguntas. Permitir únicamente índices y archivos enumerados, más `frequency_by_bank.json`.
3. Rechazar (fallar el build) cualquier ruta inesperada en `dist/data` y cualquier artefacto editorial aún presente. Mantener listado verificable de archivos antes/después y checksums de los JSON que **sí** se conservan. Evitar que una construcción exitosa se publique si se omite el paso de limpieza.
4. Adaptar **conjuntamente** `.github/workflows/ci.yml`: actualmente exige explícitamente `dist/data/exams/editorial_casebook_r23.{json,csv}`. Sustituir esas expectativas por comprobaciones de ausencia en dist y presencia/completitud en `public/data/exams` durante la fase de auditoría.
5. Mantener las exportaciones y evidencias editoriales como artefactos de CI separados de la distribución web, sujeto a sus políticas de acceso. Considerar un almacenamiento realmente privado para datos confidenciales; el repositorio fuente hoy es público.
6. Validar el empaquetador contra un fixture sintético positivo (solo archivos permitidos) y negativos (CSV/JSON editoriales, ruta traversal, listado incompleto, datos faltantes). Ejecutar `npm ci`, `npm run build:preview`, las pruebas de banco/scoring, y pruebas en Chromium con navegación, IndexedDB, carga del banco, exámenes históricos, Viajeros deshabilitado, frecuencia, PDF y responsive.
7. Verificar que `sw.js` solo referencia rutas conservadas y que no se registran fallos de precarga PWA. No promover ni desplegar sin el permiso específico que corresponda a esa ronda.

## Riesgo importante: código fuente público

**Excluir un archivo de `dist` no convierte en confidencial la información que pueda permanecer en `data-src/`, scripts, historial Git o documentos del repositorio público.** Para secretos o expedientes realmente privados se precisa control de acceso al origen, posible repositorio/almacenamiento privado y revisión de su historial. No afirmar privacidad solo por ausencia de URL web.

## Criterios de aceptación futuros

- Igualdad de los hashes de todos los archivos de preguntas, índices y frecuencia antes/después del empaquetado.
- 8.655 preguntas / 33 cuestionarios; 26 modelos históricos con su elegibilidad original; decisiones técnicas y scoring sin cambios.
- No hay respuestas ni documentos editoriales fuera del allowlist en `dist/data`.
- CI de revisión y paquetes de evidencias siguen funcionando, con comprobadores ajustados al nuevo contrato de distribución.
- Pruebas reales responsive (390, 430, 768, 1440 px) y flujos Inicio, Perfil, Crear test, exámenes, reanudación del reloj y archivo Viajeros/Mercancías.
- No hay deploy, merge, cambios de Supabase ni modificaciones de producción como parte de R62.

**Estado R62:** inventario y plan documental preparados; build/CI real y verificación del contenido de `dist` siguen pendientes.
