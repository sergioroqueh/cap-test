# R44 — Auditoría de SQL R42+R43 en PostgreSQL 17 (19/11/2026)

**Alcance:** revisión del SQL R43 de extremo a extremo y prueba únicamente en base PostgreSQL 17.12 **desechable de GitHub Actions**. No se ha ejecutado el paquete R42/R43 en `rutacap-dev`, no se han generado usuarios reales ni se ha conectado la PWA. PR #21 permanece DRAFT; `main` intacta y `cloudConfigured=false`.

## 1. Correspondencia con el esquema real

Antes de revisar se consultó en modo lectura el metadato de `rutacap-dev` (proyecto `rhtbqetskghkarxhrgee`):
- PostgreSQL 17.12; la migración R40 sigue presente y R42/R43 no se ha aplicado; 0 filas en consentimientos, eventos y sesiones comerciales.
- 12 políticas RLS en seis tablas `rc_*`; 10 de datos de estudio que llaman al helper de consentimiento y 2 de lectura directa de consentimiento/auditoría.
- Las funciones internas existentes de conceder/revocar usan `SECURITY DEFINER`, pertenecen a `postgres`, viven en `rc_internal` no expuesto y no son ejecutables por `anon`; los wrappers públicos son `SECURITY INVOKER`.
- `authenticated` NO tiene `SELECT` en `auth.sessions` ni `auth.users`, pero `postgres` sí. `auth.sessions` tiene `id`, `user_id` y `not_after`; `auth.users` tiene `deleted_at`, `banned_until`, `is_anonymous`.
- Las tablas `rc_*` conservan los permisos por **columna** de INSERT/UPDATE a `authenticated`, aunque el ACL general de tabla solo muestre `SELECT`. No confundir eso con una ausencia de permisos.

## 2. Revisión por grupos de líneas del paquete

Archivo: `docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql` (205 líneas aproximadamente).

| Bloque | Hallazgo / comprobación | Resultado |
|---|---|---|
| Encabezado y BEGIN, líneas 1–9 | Script específico de upgrade y atómico; no se debe desplegar R42 por separado | Aceptable para migración única autorizada |
| Función interna, 16–31 | `rc_internal.rc_is_active_session_v1` usa `SECURITY DEFINER`, ruta de búsqueda vacía, JWT del gateway y `EXISTS` propietario/sesión en `auth.sessions` con usuario existente, no borrado/baneado/anónimo y `not_after` válido | Semántica comprobada en PostgreSQL 17 ficticio; propietario y permisos de tabla comprobados en dev |
| Wrapper público, 32–43 | `SECURITY INVOKER` solo booleano; grants a `authenticated`, revocados a `PUBLIC`, `anon` y `service_role` en ambos procedimientos | PASS de permisos en base desechable; recordar que usuario de DB con privilegios propios puede sortear estas defensas |
| Políticas 53–69 | `ALTER POLICY` agrega sesión activa a consentimiento y auditoría, conservando propietario, rol y no-anónimo | PASS en PG17; no hace falta función privilegiada en `public` |
| Helper 72–89 | `CREATE OR REPLACE` añade sesión activa, conservando propósito/revisión y RLS, cubriendo diez políticas existentes | PASS: lecturas denegadas tras eliminar sesión; inserción directa comprobada en fixture |
| Grant, 92–146 | `SECURITY DEFINER` bloquea sesión eliminada antes de consentir; mantiene versión aviso, incremento de revisión y auditoría transaccional | PASS con retirada de sesión y nueva sesión |
| Revoke, 148–188 | Misma barrera de sesión; conserva atomicidad de revocación y auditoría | PASS con retirada de sesión y nueva sesión |
| ACL finales y COMMIT, 191–205 | Revoke defensa en profundidad; comentario sobre helper; transacción con fallo atómico | PASS en PG17 desechable |

**No se encontró error de sintaxis ni fallo del camino de revocación bajo la simulación probada.** Esto no sustituye revisión de producto, confidencialidad y legalidad antes de habilitar cloud.

## 3. Comprobación PG17 en CI

Se reutiliza el workflow R38 (sin nuevas baterías paralelas) añadiendo **un solo job** con servicio efímero `postgres:17`. Ejecuta de forma secuencial los SQL fuente auténticos C28, C29, R37, R39 y R43, no copias reducidas; las dos piezas del fixture solo crean cuentas y sesiones falsas en ese contenedor y realizan aserciones.

Secuencia: permisos `anon`/autenticado; ausencia de consentimiento; grant de A revisión 1; escritura de evento A; aislamiento de B; eliminación de sesión A con JWT sintético aún presente; denegación de lectura REST, snapshot, grant/revoke e INSERT; nueva sesión A; revoke revisión 2, regrant revisión 3; revisión y sessionId obsoletos denegados; `not_after` expirado denegado. El job **no contacta Supabase** ni emite JWT reales.

## 4. Límites, carreras y decisión

- Los claims de prueba se asignan con `set_config`: no hay firma JWT real, no se verifica Supabase Auth/GoTrue ni el estado real de `signOut(local/global)`.
- La comprobación SQL ve un snapshot MVCC por sentencia. Una lectura iniciada antes del borrado de sesión puede completarse; R38 revalida por página y tras el snapshot, pero no puede retractar una respuesta ya enviada.
- No se ha verificado aún la exposición real de la RPC en PostgREST, los Auth JWT de dos identidades o latencia con miles de eventos. Revisar EXPLAIN y Advisors tras un deploy de desarrollo autorizado.
- El RPC devuelve booleano a la sesión del propio JWT; la ruta `rc_internal` no debería agregarse a los esquemas expuestos de Data API.
- La seguridad real depende de que `auth.sessions` refleje la revocación y de que el gateway valide firma/expiración. El comportamiento de logout debe medirse con A/B genuinos.
- Para autorizar la siguiente fase, delimitar explícitamente: instalación del **paquete R43 completo** solo en `rutacap-dev`, consulta posterior de metadatos y prueba SQL/permiso sin crear ni cancelar usuarios existentes. Pruebas de cuentas A/B genuinas requieren consentimiento y autorización separada.
- **Sin permiso R44 para aplicar SQL en Supabase**: conservar `cloudConfigured=false`, no despliegues, merge, pagos, scoring, banco ni UI.

**Preferencia visual futura:** botones y tarjetas más cuadrados y menos redondeados, sin cambios de UI en rondas de auditoría.
