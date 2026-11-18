# RutaCAP C40 — Manifiesto autenticado sintético y diario durable (18/11/2026)

**Estado:** GitHub Actions [#44268172745](https://github.com/sergioroqueh/cap-test/actions/runs/44268172745), **14/14 pruebas C40**, **10/10 regresiones C39**, **7/7 regresiones C33**; todos los pasos de tests y comprobación cloud OFF terminaron correctamente. Rama `feat/cap-commercial`; PR #21 **DRAFT**; `main` intacta. No se tocó Supabase real ni se habilitó cloud, migraciones, merge, despliegue, pagos o scoring.

## Implementación aislada

- `scripts/c40_signed_journal.mjs`: **Node-only, exclusivamente pruebas**, no importado desde `src/`. Implementa emisor/verificador de sobre de manifiesto v1, diario de archivos por propietario y orquestador de reanudación sobre el lector C39.
- `scripts/test_signed_journal_c40.mjs`: 14 casos con datos y claves enteramente sintéticos.
- `.github/workflows/c40-signed-journal.yml`: CI local del runner, sin servicios externos ni endpoints. Comprueba `cloudConfigured=false` y ausencia de importaciones del módulo C40 desde la aplicación.

## Sobre firmado de prueba

El sobre versionado v1 incluye `issuer`, `issuedAt`, `expiresAt`, el manifiesto C39 (`ownerId`, `snapshotId`, `checkpoint`, `counts`, `digest`) y un MAC **HMAC-SHA-256** con separación de dominio. Se compara el MAC con `timingSafeEqual`. Se rechazan MAC modificado, versión/issuer no reconocidos, propietario diferente, caducidad y firma que no concuerde con el contenido.

**No es una arquitectura de firma para clientes públicos.** El emisor y verificador comparten un secreto **exclusivo del fixture Node**; jamás debe introducirse este secreto en código de navegador. Para producción se requiere autenticación real del servicio y JWT verificado mediante un gateway, o un esquema de firma asimétrica con clave pública y gestión de rotación confiable. HMAC y SHA-256 no sustituyen autenticación ni autorización.

## Diario transaccional sintético

Se almacena un único estado de transferencia por propietario en un directorio temporal de tests. Cada página validada se registra **antes de ser confirmada al lector** mediante escritura a archivo nuevo con permisos restrictivos, `fsync`, `rename` atómico y sincronización de directorio cuando es compatible. El formato contiene versión, identidad de sesión, sobre firmado y filas paginadas; se protege contra corrupción accidental mediante un SHA-256 **local no autenticado**.

La recuperación recrea el lector con una nueva instancia y reutiliza las páginas confirmadas. Una firma de manifiesto válida y el digest final completo de C39 permiten detectar alteraciones del contenido del diario. La reanudación se rechaza si cambian sesión, propietario, generación, issuer, versión o expiración; logout o cambio A/B purgan el estado anterior.

**Límites reales del experimento:** la prueba usa archivos JSON de un runner Node temporal, **no IndexedDB ni WebKit ni iPhone**. El SHA local puede recalcularse por alguien con acceso al fichero: no proporciona autenticación y las filas no están cifradas. Solo se guardan datos sintéticos, con un máximo fijo de bytes de fixture. `fsync + rename` y el test del archivo temporal demuestran la política implementada, no resiliencia física frente a apagado real/corrupción de sistema de archivos. No hay persistencia de token o secretos.

## Evidencia C40 (14/14)

1. Sobre firmado v1 válido; se rechazan otro issuer/owner, MAC manipulado, versión inesperada y secreto insuficiente.
2. Transferencia completa y limpieza del diario tras `finish` verificado.
3. Interrupción simulada y reanudación con nuevo lector a partir de un archivo persistido, sin volver a pedir páginas completadas.
4. Archivo temporal sin finalizar ignorado tras interrupción.
5. JSON corrupto aborta y elimina el diario.
6. Un atacante que recalcula el hash local tras alterar una respuesta **no** supera la verificación del digest completo del manifiesto firmado.
7. Logout mientras una página está pendiente: aborto y eliminación de diario, sin `finish`.
8. Cambio A→B durante lectura: aborto A, sin datos cruzados; B puede realizar su propia transferencia independiente.
9. Nueva sesión del mismo usuario no puede reutilizar diario de la sesión anterior.
10. Expiración entre corte y reanudación: rechaza y descarta estado.
11. Nuevo snapshot/generación del mismo usuario invalida la continuación antigua; puede iniciarse transferencia limpia.
12. Firma inválida impide leer la primera página.
13. Consentimiento ausente o transporte no-fixture rechazados.
14. Invalidación explícita al cerrar sesión elimina diario parcial.

Además: 10 regresiones C39 de SHA-256/paginación y 7 regresiones C33.

## Bloqueos para autorización cloud

- Un proveedor `fixtureOnly:true` sigue siendo **marca de prueba**, no una frontera de seguridad; falta autenticación de servicio, JWT, autorización de tenant y material de firma de servidor real.
- El diario Node no equivale a un journal transaccional de IndexedDB en Safari/Android; falta versión de esquema y recuperación real de navegador, cuotas, cifrado en reposo y tratamiento de errores de espacio/energía.
- El formato JSON canónico se ha probado dentro de JavaScript, pero no con PostgreSQL ni con clientes de otros lenguajes. C38 MD5 sigue separado de C39/C40 SHA-256.
- Faltan ensayos de HTTP real en entorno aislado/autorizado, reanudación después de cierre abrupto de proceso en dispositivo real, multi-pestaña y colisiones de escritor, expiración de token verificado, rotación/revocación de claves y validación end-to-end de `begin/page/finish`.
- Dispositivos físicos iOS/Android y accesibilidad de C35 **sin ejecutar**.
- Validate CAP falla por discrepancia editorial R32 `2/2/1` frente a `3/3/3`; **no modificar scoring** para silenciarla.

## C41 recomendado

Diseñar en un **harness de navegador sintético y local**, no servidor real, un journal IndexedDB de páginas reanudables con bloqueo de escritor, transacciones abortables al cerrar sesión, recuperación de versión y pruebas Playwright Chromium/WebKit-Linux. Conservar HMAC de C40 exclusivamente en Node; el navegador debe recibir solo evidencia que pueda verificar sin alojar una clave secreta. Sin deploy, Supabase real ni producción.
