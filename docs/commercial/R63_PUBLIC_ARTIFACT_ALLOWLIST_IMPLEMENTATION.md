# RutaCAP — R63: allowlist de distribución web (sin despliegue)

Fecha: 19/11/2026
Repositorio: sergioroqueh/cap-test
Rama autorizada: feat/cap-commercial
PR #21 OPEN DRAFT, sin merge
HEAD de partida: 1ec0055af26a1b17ffc99aa6d3822effbec4051a

## Objetivo y alcance

La compilación conserva la preparación editorial R20-R31 en public/data, pero
el artefacto final del alumno (dist/data) contiene exclusivamente los JSON
necesarios para cargar banco, exámenes y frecuencia. No se modifica data-src/,
las fuentes de preguntas, las plantillas de respuesta, el scoring, Supabase,
main, PWA, protección Vercel, R58 ni producción.

## Integración contra bypass

- scripts/package_public_data_r63.mjs valida, elimina exclusivamente
  informes editoriales explícitamente reconocidos y verifica el resultado.
- Hook closeBundle de Vite en modo build: se ejecuta al terminar de escribir
  el bundle, incluido si se usa vite build directamente.
- npm run build y npm run build:preview ejecutan prepare:data, tsc -b,
  vite build y, además, node scripts/package_public_data_r63.mjs --verify.
- El modo catalog-local mantiene su prohibición de compilar.
- La limpieza se ejecuta en dist/data exclusivamente; cualquier fichero
  desconocido bajo ese árbol hace fallar el build, antes de borrar nada.
- Los CSV/JSON editoriales conocidos se retiran solo de dist. Los informes
  originales permanecen en public/data/exams para auditorías y artefactos de
  CI independientes.

## Allowlist, comprobaciones y hashes

Conserva exactamente 62 ficheros JSON:
- data/index.json y 33 data/questions/*.json, referenciados por el índice.
- data/exams/index.json y 26 data/exams/questions/*.json, referenciados.
- data/exams/frequency_by_bank.json.

Precondiciones estrictas: 8.655 preguntas, 33 cuestionarios, 26 modelos
históricos, 2.600 apariciones históricas, 100 por modelo, suma de conteos
consistente, rutas canónicas relativas sin .., URL o duplicados, todos los
ficheros existentes. Los 62 hashes SHA-256 se comparan byte a byte entre
public y dist antes de limpiar y después. --verify exige que no haya
ningún extra en dist/data. Se genera el inventario
artifacts/r63-public-allowlist-manifest.json fuera del paquete.

La preservación de bytes incluye correctAnswer, technicalDecision,
scoringEligible, la elegibilidad original de los modelos, contadores,
frecuencias y la trazabilidad incorporada en las preguntas; ninguno de estos
campos es transformado por el empaquetador.

## Pruebas y CI

- scripts/test_public_package_r63.mjs: fixtures completamente sintéticos
  con índices de tamaño y recuento real, conservación de hashes, eliminación
  en dist únicamente, conservación en public, idempotencia de la verificación,
  rutas traversal/URL/ruta no canónica, duplicados, archivo ausente, JSON
  manipulado, conteos alterados, material inesperado y auditorías residuales.
- .github/workflows/ci.yml: elimina la expectativa errónea de expedientes
  R23 en dist; los exige en public y comprueba su ausencia en dist.
  Revalida el paquete de producción y el de Preview, y exporta manifiesto de
  hashes separado del ZIP web. Mantiene intactos los generadores y pruebas
  de scoring/frecuencia/banco, así como los artefactos editoriales.
- scripts/e2e_r63_public_preview.mjs: Chromium sobre la Preview de CI
  local, cuatro anchos (390/430/768/1440), portada, archivo 25 Mercancías
  y un Viajeros, ausencia de desbordamiento, recursos sin 4xx; registra
  explícitamente el service worker en un contexto aislado y verifica precarga
  de 66 rutas en total (7 CORE y 59 JSON de preguntas), sin editoriales.
  El registro automático del SW en Preview permanece deshabilitado como antes.
- Conserva la batería preexistente de CI que prueba motor, corrección,
  persistencia, reloj, historiales, PDF, UI y responsive.

## Restricciones y seguridad de origen

R63 no convierte en privados los documentos o scripts que sigan presentes
en el repositorio público de GitHub ni en su historial. La allowlist protege
el artefacto distribuido, no la confidencialidad del código o del banco origen.
No se ha realizado migración, restore/export de Supabase, pago, merge ni
deploy. R58 continúa protegida y lista sin modificación.

## Estado de verificación

Se solicitará CI real del nuevo HEAD al guardar los cambios en la rama
autorizada. Si Actions está pendiente o falla, R63 no se considerará
validada hasta conocer el resultado. La ausencia de acceso de red a GitHub
desde el contenedor impide por sí sola compilar el checkout local; no se
debe presentar esta limitación como un PASS de TypeScript o Chromium.

La Preview protegida queda como opción posterior, sin publicarla ahora.

## Estado observado tras el primer commit

Commit funcional R63: 6f786f7c4c9d7a9d445cbf5656e2b5ce10c744ce.
La API de GitHub no muestra ejecuciones de Actions para dicho SHA al
consultarla; no se declara PASS de la nueva CI ni del navegador.
El commit R63 no cambia main. Main se observó posteriormente en
 d91e59e9f0e648a558a3cbcd93b77fcec7e9612a debido a un cambio
previo de public/sw.js ajeno a esta ronda (15:21 UTC).

## Verificación local ejecutada (R63)

Los blobs del empaquetador y del test se reprodujeron en un entorno aislado
Node v22.16.0, confirmando sus SHA de Git: empaquetador
4fc29823d6106719868f2eb9579f5c10c9c02b36 y test corregido
d9528d248345700202a68126045955aa7de8ac00.
Se ejecutó node --test scripts/test_public_package_r63.mjs:
17 pruebas, 17 PASS, 0 FAIL (fixtures exclusivamente sintéticos).
La primera ejecución detectó una expectativa errónea de dos entradas en la
raíz de dist/data; se corrigió a tres (exams, index.json y questions)
y se repitió toda la prueba hasta PASS. No se usaron bancos reales.

No se ha ejecutado en este entorno npm ci, build:preview, TypeScript,
ni Chromium con datos reales; las correspondientes comprobaciones de
GitHub Actions continúan pendientes y deben verificarse antes de desplegar.
