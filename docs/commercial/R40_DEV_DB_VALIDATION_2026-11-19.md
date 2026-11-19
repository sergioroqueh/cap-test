# R40 — Validación de esquema en rutacap-dev (19/11/2026)

**Estado:** migración SQL C28+C29+R37+R39 **APLICADA EN DESARROLLO**, no en producción. PR #21 sigue DRAFT; `main` intacta; `cloudConfigured=false`. Sin desplegar Vercel, sin merge, sin pagos, sin tocar scoring, banco ni UI.

## Autorización y destino

Autorización explícita recibida el 19/11/2026 para la fase de validación de desarrollo. Proyecto Supabase en la conexión independiente **RutaCAP**:
- Nombre: `rutacap-dev`; ID: `rhtbqetskghkarxhrgee`, región eu-west-1; PostgreSQL 17.12.
- No se conectó CuadernoTécnico ni se consultaron otros proyectos.
- Antes: cero tablas `rc_*`, cero funciones `rc_*`, cero migraciones.
- Migración aplicada en una sola operación atómica: `20261119073246_rutacap_r39_dev_schema_consent_20261119`.
- SQL fuente: C28, C29, R37 y R39 (borradores del repositorio, consolidados eliminando BEGIN/COMMIT internos). El archivo R39 fue corregido antes de aplicar: funciones privilegiadas en `rc_internal`, RPC públicos SECURITY INVOKER y delimitadores SQL corregidos. No se ejecutó un cambio de código de la PWA.

## Validación posterior con Supabase

- 6 tablas `public.rc_*` creadas, **todas con RLS activo**: perfiles, progreso, sesiones, eventos, consentimientos y auditoría.
- 12 políticas RLS instaladas. Tablas de datos comerciales: **0 filas** tras el smoke-test.
- `anon` no tiene EXECUTE sobre ninguna función `rc_*` examinada; `authenticated` solo en la API necesaria. La función antigua `rc_read_consistent_snapshot_v1` ya no es ejecutable por `anon` ni `authenticated`.
- Las dos funciones SECURITY DEFINER de grant/revoke están en `rc_internal` (fuera del esquema Data API) y los RPC `public` correspondientes son SECURITY INVOKER.
- Auth del proyecto contiene **1 usuario real**, con 2 sesiones al preflight. No se han creado usuarios de prueba ni tokens nuevos.

## Prueba SQL focalizada con ROLLBACK (PASS)

La prueba se ejecutó en una única transacción con el rol PostgreSQL `authenticated` y reclamaciones JWT **simuladas con set_config**, sin tokens reales de Supabase Auth. Se terminó con **ROLLBACK** y se reconfirmaron todas las tablas vacías.

Aserciones verificadas:
1. Sin consentimiento, ni lectura autorizada ni snapshot.
2. Grant explícito, revisión 1.
3. Insert transaccional de un evento y una sesión ficticios; snapshot v2 coherente devuelve ambas colecciones.
4. `session_id` esperado diferente: denegado.
5. Principal sintético alternativo B: no lee el snapshot ni los eventos del principal A.
6. Revocación, revisión 2: consulta y lecturas denegadas.
7. Regrant, revisión 3: la revisión anterior no recupera el snapshot; la nueva sí.
8. Auditoría propia contiene tres cambios dentro de la transacción.
9. Tras ROLLBACK: 0 eventos, 0 sesiones, 0 consentimientos, 0 auditorías.

**Importante:** estas pruebas certifican comportamiento **SQL/RLS bajo GUCs simulados**, no autenticación criptográfica, refresh token, revocación real de sesión, conexión HTTPS del servidor ni aislamiento entre dos cuentas auténticas.

## Advisors después de aplicar

Security Advisor: las únicas advertencias son preexistentes:
- `public.rls_auto_enable()` en SECURITY DEFINER y ejecutable por `anon` y `authenticated` (2 avisos sobre la misma función), previamente documentado en C24.
- Leaked Password Protection desactivado (1 aviso).
No se ha cambiado ninguna de estas configuraciones por quedar fuera de autorización específica.

Performance Advisor: 12 avisos `auth_rls_initplan` sobre las nuevas políticas y 2 índices sin uso (normal en tablas vacías). En `pg_policies` se confirmó que las políticas ya usan subconsultas escalares `(select auth.uid())`, `(select auth.jwt() ->> ...)` y `(select rc_has_active_progress_sync_consent_v1())`. **No afirmar que los avisos son falsos positivos sin EXPLAIN**; comparar planes y corregir selectivamente si procede antes del cloud.

## Puertas todavía cerradas

- **A/B real Supabase Auth pendiente:** solo existe una cuenta real. No se han creado A/B por SQL (alterar manualmente `auth.users` no produciría credenciales reales). Para una prueba auténtica hace falta segunda cuenta voluntaria y JWT emitidos por Supabase, comprobados mediante `getClaims`/`getUser`, y backend de sesión activa.
- `createAuthClient`, `checkActiveSession`, `readConsent` y `takeConsistentSnapshot` siguen sin estar conectados a un servidor real. El protocolo R36 aún espera solo `userId`, no recibe parámetros persistentes de sesión/revisión para v2.
- `progress-sync-v1` sigue siendo versión técnica de aviso; falta texto informado y acción explícita de usuario antes de un consentimiento operativo.
- La migración de desarrollo **no equivale** a autorizar cloud en el producto, deploy, merge o producción.
- Pendiente protocolo de recuperación/retención/borrado; no ejecutar rollback destructivo en el proyecto sin revisar contenido y autorización específica.

## Propuesta R41 (sin pedir pruebas al usuario durante su jornada)

1. Diseñar adaptador server-only que reciba el JWT verificable, derive la identidad de él y llame al RPC snapshot v2 con sesión/revisión comprobadas, fail-closed.
2. Investigar los 12 avisos de rendimiento con EXPLAIN o banco descartable, sin alterar scoring, banco ni UI.
3. Preparar checklist de dos cuentas A/B reales y autorización independiente para acciones con ellas, sin tocar cuentas o datos ajenos.
4. Mantener Vercel y cloud OFF hasta pasar las pruebas reales y contar con consentimiento informado.
