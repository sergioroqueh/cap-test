# C42 — Firma pública en navegador y revocación entre pestañas (18/11/2026)

**Estado comprobado:** CI [#44272530631](https://github.com/sergioroqueh/cap-test/actions/runs/44272530631) — **SUCCESS**, 9/9 escenarios C42 en Chromium y 9/9 en WebKit Linux; regresiones C41: 9/9 por navegador; C40: 14/14. Los resúmenes TAP incluyen también dos tests agrupadores por cada batería de navegadores: C42 20/20, C41 20/20 y C40 14/14 nodos. Comprobaciones de `cloudConfigured=false`, ausencia de imports desde `src/` y de secretos/transportes remotos en el módulo: PASS.

## Incidencia durante implementación

La primera ejecución [#44272163452](https://github.com/sergioroqueh/cap-test/actions/runs/44272163452) terminó FAILURE porque el test de adquisición de lease simultánea intentaba leer `error.code` **después** de que Playwright serializara una excepción al lado Node, perdiendo el campo personalizado. El comportamiento esperado de las dos transacciones no se reportaba correctamente. Se corrigió capturando el código dentro de `page.evaluate()`; la segunda ejecución [#44272530631](https://github.com/sergioroqueh/cap-test/actions/runs/44272530631) repitió las pruebas y terminó SUCCESS. No se ocultó ni suprimió el escenario fallido.

## Archivos y aislamiento

- `scripts/c42_browser_security.mjs`: implementación de **laboratorio exclusivamente para navegador**, no importada por la PWA ni desplegada. WebCrypto solo recibe **JWK pública P-256**, valida firmas ECDSA-SHA-256 y los claims de sobre: `version`, `kid`, `issuer`, `audience`, `issuedAt`, `expiresAt`, `ownerId`, `snapshotId`, `checkpoint`, conteos y digest.
- `scripts/test_browser_security_c42.mjs`: crea un par de claves efímero en el proceso **Node**, firma el manifiesto con la clave privada y transfiere al navegador únicamente el mensaje y la JWK pública. Utiliza Playwright Chromium/WebKit-Linux sobre servidor HTTP de fixtures ligado a `127.0.0.1`; rutas externas denegadas. **Nunca sirve la clave privada**.
- `.github/workflows/c42-browser-security.yml`: instala motores en runner temporal, ejecuta C42, C41, C40 y asegura cloud apagada y que el módulo no se importa desde `src/`.

El sobre usa separación de dominio `RUTACAP-C42-MANIFEST-P256-V1`, JSON sintético con orden determinista de claves y firma ECDSA P-256 formato IEEE P1363. Los tests corroboran con WebCrypto que se acepta firma válida y se rechazan: alteración de firma/contenido, `issuer`, `audience`, propietario, versión, `kid` desconocida, sustitución de clave pública, clave con campo privado, expiración y `issuedAt` futuro. La keypair no es persistente y **NO** constituye una infraestructura de claves lista para producción.

## Coordinación BroadcastChannel e IndexedDB

`createC42Coordinator` verifica el sobre antes de adquirir lease y usa el journal de C41 sin cambiar sus datos ni schema. `BroadcastChannel` se utiliza **solo como aviso de higiene**: al cerrar sesión en una pestaña se elimina el registro y el lease de IndexedDB y se avisa a las otras pestañas con la misma identidad sintética. Un lector que espera una página aborta y no persiste filas tardías. Otra cuenta B, aunque comparta canal/origen, no se revoca al cerrar sesión A.

La **autoridad del estado es la transacción IndexedDB y el fencing**, no un mensaje BroadcastChannel (un script malicioso del mismo origen podría suplantar dichos mensajes). Las pruebas verifican que de dos adquisiciones simultáneas para el mismo propietario, solo una gana; tras expirar el lease, el escritor obsoleto es rechazado.

Se probó además un `IDBTransaction.abort()` real después de programar una escritura: el estado anterior queda intacto. La cuota de espacio es **umbral sintético de C41**, y los objetos `QuotaExceededError` y `AbortError` del DOM se usan para **probar clasificación de errores**, no se forzó una condición de falta de espacio física del navegador o sistema operativo.

## Resultados y limitaciones

C42: 9 subpruebas **PASS por motor** (18 comprobaciones), C41: 9 por motor (18), C40: 14. Total **50 escenarios**, o **54 nodos TAP** si se incluyen los cuatro tests agrupadores.

**No es autorización para cloud, despliegue ni uso real de historiales.**

- La JWK pública la fija el test; falta una distribución **anclada a una raíz de confianza** y política de rotación/revocación de llaves para servicio real. Verificar una firma no valida por sí solo un JWT ni derechos sobre un tenant.
- El formato canónico del fixture no es aún un protocolo firmado interoperable y versionado de producción. Falta integración con C38 PostgreSQL, endpoints HTTP y restauración real de usuario.
- BroadcastChannel no ofrece autenticación. La identidad, la sesión y el consentimiento actuales son datos **sintéticos**, no claims verificados por proveedor.
- IndexedDB de este harness no está conectado a la PWA real; no hay cookies, datos personales, recuperación multiplataforma ni pruebas de persistencia tras caída física de energía.
- WebKit Linux **no equivale a Safari/PWA en iPhone físico**. QuotaExceededError real, presión real de almacenamiento, otras políticas OS y accesibilidad física pendientes.
- Continúa la incidencia Validate CAP editorial R32 `2/2/1` frente a `3/3/3`. No modificar scoring para hacerla pasar.

## Próximo objetivo C43 propuesto

Diseñar contrato de confianza y claves de verificación, pruebas de rotación de `kid`/revocación y vinculación real de claims sintéticos, versiones de esquema y dominio; comprobar condiciones límite multi-tab de expiración, reload y escrituras simultáneas bajo conexiones cerradas. Mantener la implementación en fixtures hasta autorización expresa y puerta de iPhone/Android real.
