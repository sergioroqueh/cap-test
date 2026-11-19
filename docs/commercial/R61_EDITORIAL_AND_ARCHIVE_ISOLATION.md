# RutaCAP R61 — Aislamiento de auditoría editorial y filtro del archivo

Fecha: 2026-11-19
Rama: `feat/cap-commercial`; PR #21 DRAFT.
Base anterior: `de5c20d4b5fff6c9caac60db1e481f1b237c433e`.
Commit funcional: `189fc9d7da84796107aba092f85f2d1e1bf51e1b`.

## Alcance autorizado
Corregir exclusivamente (1) dependencia innecesaria del catálogo de exámenes CAP respecto a la carga del resumen editorial y (2) acoplamiento del filtro histórico Viajeros/Mercancías con la práctica de Mercancías. No se han tocado puntuación, preguntas, generadores del corpus, Supabase, main ni Vercel. No se ha realizado despliegue manual.

## Cambios
- `src/App.tsx`: `loadCapIndex()` resuelve de forma independiente el catálogo principal. `loadCapEditorialTriage()` se solicita únicamente con `import.meta.env.DEV`; en desarrollo un error de carga editorial queda como aviso de consola, no como bloqueo de la portada.
- El estado de práctica `category` permanece en `mercancias`; nuevo estado `archiveCategory` para consultar el archivo. Los contadores, listado, selector, consultas editoriales DEV y reseteo asociado dependen del estado del archivo. Los accesos principales conservan la disponibilidad de Mercancías.
- Al iniciar una convocatoria seleccionada, su etiqueta de modalidad procede de `meta.category`, sin afectar preguntas o scoring. Un examen histórico sin plantilla continúa deshabilitado.

## Comprobaciones realizadas
14 comprobaciones estructurales de lectura de código: carga autónoma del índice; guardia DEV; error editorial no bloqueante; dos estados separados; botones del archivo; listado, contadores y selectores; disponibilidad principal; bloqueo de modelos sin plantilla; etiqueta procedente de metadatos; solo `src/App.tsx` modificado respecto al HEAD R59; referencia del lector editorial. Resultado: 14/14 verificaciones estáticas PASS.

No es una batería de navegador ni constituye compilación completa. No se pudo clonar el repositorio desde el contenedor por fallo de resolución DNS; no se realizó `npm ci`, `npm run build:preview`, test TS ni ensayo responsive. No se han encontrado ejecuciones CI asociadas al commit funcional al cerrar esta inspección.

## Hallazgo documental — activos editoriales dentro de public/
`scripts/prepare_data_cross_platform.mjs` ejecuta generadores editoriales durante la preparación del build. Entre ellos:
- `scripts/build_editorial_triage_r21.py` genera `public/data/exams/editorial_triage_r21.json` y `.csv`.
- `scripts/build_editorial_casebook_r22.py`, `r23.py` y `r24.py` generan expedientes editoriales `.json`/`.csv` dentro de `public/data/exams`.
- `scripts/build_sheet_audit.py` y generadores técnicos producen informes similares.
La carpeta generada no está versionada actualmente en `public/` de GitHub; se crea durante `prepare:data`. Vite copia `public/` a la distribución. Por ello, ocultar el panel con `import.meta.env.DEV` no impide que sus ficheros generados sean descargables desde un despliegue para quienes tengan acceso al sitio (sin perjuicio de la autenticación de Vercel de las Previews).

No se han borrado, filtrado ni movido archivos: podrían ser insumos de la trazabilidad y se requiere una clasificación y plan de empaquetado independientes. Antes de producción, identificar artefactos puramente editoriales exportables y excluirlos del paquete web sin romper el índice, la calificación o las evidencias necesarias del alumno. Probar las URLs concretas en un entorno protegido autorizado, sin desprotegerlo ni generar enlaces públicos de compartición.

## Pendientes
1. `npm ci && npm run build:preview` sobre el SHA final, en un entorno confiable con acceso al repositorio.
2. Prueba visual real en escritorio, tablet y móvil (incluida selección de Viajeros y regreso a Mercancías; continuidad de iniciar Mercancías).
3. Confirmación de CI y de que no hay cambio en scoring/banco mediante pruebas existentes.
4. Auditoría del empaquetado de informes editoriales antes de producción; no ejecutarla como parte de R61.
5. Nuevo despliegue Preview solo con autorización específica.

Estado: correcciones funcionales R61 implementadas; verificaciones estáticas PASS; compilación/CI/UI reales pendientes.
