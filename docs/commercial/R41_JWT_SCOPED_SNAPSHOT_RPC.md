# R41 — Lector SQL por JWT y contexto R38 (19/11/2026)

**Ronda solo de código servidor, sin deployment ni nuevas migraciones.** Este cambio NO modifica la PWA, el banco, el scoring, la UI ni su configuración cloud. PR #21 permanece DRAFT.

## Problema que resuelve

R36 enviaba `userId` al adaptador de lectura, mientras que el snapshot PostgreSQL R39 v2 exige `consentRevision` y `session_id`, ligados al JWT del mismo usuario. R41 añade un segundo argumento de contexto al método `takeConsistentSnapshot(userId, scope)`:
- `scope.accessToken`: JWT original que **ya pasó R38**, suministrado por servidor, no por parámetros URL.
- `scope.sessionId`: sesión verificada por R38 (UUID).
- `scope.consentRevision`: revisión positiva verificada por R38.

Los dobles de R36 y R38 que solo usan el primer argumento mantienen compatibilidad.

## Nuevo archivo

`src/serverSnapshotRpcReader.mjs`: `createServerSnapshotRpcReader`, **desactivado por defecto**. Al activarlo intencionalmente en un futuro servidor, exige URL `https://<ref>.supabase.co`, clave **sb_publishable_...** y transporta un POST autenticado a `/rest/v1/rpc/rc_read_consistent_snapshot_v2`.

- No importa la PWA, no lee variables de entorno automáticamente, no usa `service_role`, no guarda ni registra el token.
- La autorización del usuario la impone el JWT en PostgREST/RLS y R39; NO el `userId` enviado por el cliente. El RPC solo recibe `p_expected_consent_revision` y `p_expected_session_id`.
- Limita el tiempo y tamaño de respuesta, exige HTTP 200, `schemaVersion=1`, propietario exacto, colecciones completas y ≤5.000 elementos/recurso.
- Respuestas NULL, JWT expirado, denegación RLS, red caída, formato inesperado o un propietario distinto **fallan cerradas**; no se convierten en `[]` ni en éxito silencioso.
- R36 revalida R38 después de materializar el snapshot y en cada página posterior. El lector no promete revocación instantánea de una sentencia PostgreSQL ya iniciada.

**Seguridad de habilitación:** el lector solo funcionaría con `enabled:true` y credenciales externas. No hay conexión desde UI ni ruta desplegada. Una instancia de servidor autorizada debe garantizar verificación real de `getClaims/getUser`, membresía en `auth.sessions` o equivalente, consentimiento persistido, TLS y controles de petición. Esas integraciones siguen pendientes.

## Verificación focalizada

`scripts/test_server_snapshot_rpc_r41.mjs` usa un `fetchImpl` local, sin credenciales reales ni llamadas a Supabase. Verifica: desactivación inicial sin red; rechazo de clave secreta/HTTP; envío del JWT de usuario, sesión y revisión sin userId arbitrario; rechazo de JWT no admitido por R38; HTTP 401, NULL, JSON inválido, owner extraño o exceso de bytes; bloqueo de snapshot obsoleto y lectura nueva tras cambiar la revisión.

El workflow R38 ya existente ejecuta el test de R41 además de R36/R38, con filtro por rutas. No se ha creado una batería sintética nueva ni un workflow adicional.

## Estado de la base y próximos límites

R40 instaló **solo en rutacap-dev** la migración `20261119073246_rutacap_r39_dev_schema_consent_20261119`; 6 tablas RLS con cero filas de datos tras ROLLBACK. R41 no aplica SQL ni intenta generar identidades Auth por SQL.

Pendiente prueba con **dos cuentas auténticas A/B** y JWT emitidos y revocados por Supabase. También sigue pendiente el adaptador de sesión activa y el de lectura de consentimiento (R38 inyectados); el flujo real de consentimiento informado y las decisiones de producción se autorizan aparte.

**Preferencia visual futura del producto:** botones, tarjetas y contenedores con bordes más cuadrados y menos redondeados. Solo cuando se abra ronda específica de diseño, sin mezclarla con esta auditoría de seguridad.
