# C41 — Diario IndexedDB aislado en Chromium y WebKit Linux (18/11/2026)

## Evidencia de GitHub Actions

- Primera ejecución [#44269941354](https://github.com/sergioroqueh/cap-test/actions/runs/44269941354): **FAILURE de preparación**, el repositorio no tiene `package-lock.json` y `npm ci` no podía ejecutarse. No llegó a iniciar ningún navegador. Se cambió solo el workflow a `npm install --no-save --no-package-lock --no-audit --no-fund`.
- Ejecución corregida [#44270050439](https://github.com/sergioroqueh/cap-test/actions/runs/44270050439): **SUCCESS**. En la salida TAP de Node se registran **9 subpruebas en Chromium**, **9 en WebKit Linux**, con dos tests agrupadores (20/20 nodos TAP PASS), y **14/14 regresiones C40 PASS**. Verificación de `cloudConfigured=false`, ausencia de importaciones de C41 desde `src/`, de código HMAC/secreto en navegador y de conectores remotos: PASS.
- PR #21 continúa **DRAFT** y `main` sin cambios. No Supabase real, migraciones, activación cloud, merge, deploy, pagos ni scoring.

## Componentes de prueba

- `scripts/c41_browser_journal.mjs`: módulo de navegador **no importado por la PWA**, con BD independiente `rutacap-c41-fixture-<namespace>`. IndexedDB v2 contiene `jobs` y `leases`. Solo registra datos sintéticos de las pruebas.
- `scripts/test_browser_journal_c41.mjs`: Playwright abre Chromium y WebKit Linux sobre **servidor HTTP efímero limitado a `127.0.0.1`**, que sirve únicamente HTML y el módulo fixture. No accede a servicios externos ni a cuentas reales. El motor de almacenamiento es IndexedDB verdadero del navegador.
- `.github/workflows/c41-browser-idb-journal.yml`: instala navegadores en un runner GitHub temporal, ejecuta los dos motores, repite C40 y revisa aislamiento.

## Semántica de seguridad y recuperación

1. Cada escritura de página se realiza en una transacción IndexedDB `readwrite` que consulta tanto el lease como el estado antes de validar y guardar la nueva revisión. Una página duplicada, fuera de orden, excedida o abandonada aborta la transacción sin persistencia parcial.
2. El lease almacena propietario, token por instancia, número de fencing y tiempo de expiración. Una segunda pestaña no puede escribir mientras el lease esté vigente; después de vencer puede reclamarlo e invalida al escritor antiguo.
3. El estado incluye sesión, propietario, generación (`snapshotId`, `checkpoint`), digest, conteos y páginas completadas. Cerrar la pestaña y crear un nuevo contexto de lector conserva la secuencia; el nuevo lector reclama un lease expirado antes de continuar.
4. `finish` solo se confirma si coinciden conteos y SHA-256 de todas las filas en orden, compatible en el fixture con el digest C39 calculado por Node.
5. `logout` elimina job y lease en una sola transacción. Una página que llega después encuentra lease inexistente y se rechaza. En una sesión nueva o generación distinta no se recupera el journal previo.
6. Una actualización v1→v2 **descarta** registros heredados porque no existe evidencia suficiente de su propietario/checkpoint autenticados: elección fail-closed.
7. La cuota probada es un umbral **inyectado y sintético** `maxBytes` que aborta la operación. No se ha forzado un `QuotaExceededError` real del SO ni validado pérdida física de energía.

## Evidencia desglosada: 9 escenarios × 2 motores

- Escrituras y lectura atómicas; SHA-256 coherente entre Node y WebCrypto; finalización solo con generación completa.
- Rechazo de offset incorrecto, fila duplicada y repetición, sin cambios de revisión.
- Bloqueo entre dos pestañas, expiración/fencing y rechazo de escritura vieja.
- Cierre/reapertura de pestaña con recuperación de páginas y finish.
- Logout antes de responder una página sintética: aborta la escritura tardía.
- Límite de espacio sintético: rollback intacto.
- Propietario incorrecto y alteración de fila: `finish` rechazado.
- Actualización de esquema v1 eliminando registros no verificables.
- Expiración de manifiesto y nueva sesión sin reutilización de datos anteriores.

## Limitaciones y puerta C42

- Esta BD IndexedDB es **exclusivamente fixture**. No reemplaza el IndexedDB de producción ni representa una migración real de la app. No hay interfaz, exportación/restauración real, ni comunicación con Supabase.
- El manifest se trata como dato **confiado por la prueba**, no es verificado por JWT o firma de servidor desde navegador. C40 HMAC pertenece solo a Node. La marca/mock y el fencing no sustituyen autenticación de usuarios; un script comprometido en el mismo origen podría manipular IndexedDB.
- `WebKit Linux` no es Safari/PWA ejecutándose en un iPhone. Persistencia tras cierre completo de Safari, presión real de espacio, políticas de borrado de datos y accesibilidad física quedan pendientes.
- Las pruebas de dos pestañas comparten origen/identidad sintética; falta confirmar con usuarios A y B y dos sesiones autenticadas reales o emuladas con un broker de identidad de prueba.
- C36/C37/C38/C39/C40 no constituyen aprobación cloud. R32 editorial `2/2/1` vs `3/3/3` sigue pendiente, sin alterar scoring.

**C42 propuesto:** integrar un harness browser-only de autorización pública asimétrica (verificación con clave pública, sin secreto de servidor), invalidación entre pestañas con BroadcastChannel, colisiones reales de guardado y recuperación de errores de IndexedDB/espacio, siempre sobre fixtures. No activar cloud.
