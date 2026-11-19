# R38 — Frontera de autenticación y consentimiento (18/11/2026)

**Estado:** preparación de código, SIN ejecutar contra Supabase y SIN desplegar. PR #21 DRAFT; `cloudConfigured=false`; `main` intacta.

## Punto de partida verificado
- R35: Chromium/IndexedDB real en Windows, PASS y sin peticiones cloud.
- R36: lectura HTTP local de snapshot, Windows 2/2 PASS.
- R37: SQL RLS en PostgreSQL 16 desechable, CI #44415298236 SUCCESS. No JWT Supabase real.
- Copia personal v3: exportación y vista previa del JSON mostraron **98 preguntas, 1 sesión y 98 operaciones**. No restaurar sin necesidad.
- C28/C29/R37 siguen siendo SQL **de revisión no aplicado**.

## Decisión mínima (R38)
Añadimos `src/serverAuthConsentGate.mjs`, sin importarlo desde Vite. Es una función
`createServerAuthConsentGate(...)` con dependencias server-side inyectadas, que devuelve
un verificador compatible con `verifyAccessToken` del protocolo R36.

Para aceptar una petición exige **tres barreras independientes**:

1. **JWT:** Supabase Auth `auth.getClaims(jwt)` verifica criptográficamente la firma y la expiración, y el módulo exige issuer específico, sujeto UUID, sesión UUID, rol/audiencia autenticada y `is_anonymous=false`. `auth.getUser(jwt)` consulta al servidor Auth; nunca se confía en `getSession().user`, una carga JWT decodificada sin verificar o `user_metadata`.
2. **Sesión activa:** `checkActiveSession({userId,sessionId})` debe consultar una fuente servidor autorizada. La existencia de un JWT vigente **no prueba** que no se haya cerrado la sesión: un access token puede sobrevivir hasta `exp`. Esta función está inyectada, **no implementada**. El runtime futuro necesitará controles de privilegios mínimos en su consulta a `auth.sessions` o mecanismo equivalente aprobado.
3. **Consentimiento revocable:** `readConsent({userId,purpose:'progress-sync'})` consulta un registro persistido y revocable del **mismo propietario autenticado**. Se exige `granted=true`, `revokedAt=null` y `revision` entero positivo. Falta crear esta tabla y su operación de grant/revoke con RLS/permiso mínimo; no puede depender del campo que envíe el navegador.

**Aislamiento de instancias:** `createAuthClient` debe devolver cliente nuevo por petición, con publishable key y sesión no persistida, para evitar compartir credenciales entre usuarios en instancias calientes de servidor. NUNCA exponer key service_role/secret en la PWA, ni usar un singleton compartido con estado de usuario.

## Cambio complementario R36
`src/serverSnapshotProtocol.mjs` ahora fija `sessionId` y `consentRevision`
en cada snapshot: un re-grant de consentimiento con revisión nueva **no puede reabrir**
el snapshot antiguo. Revalida la identidad **después de la lectura inicial** y antes de entregarla; si se revoca durante esa lectura, devuelve 401 y no guarda un snapshot.
Las identidades de los tests anteriores sin sesión/revisión siguen compatibles
(`null`) únicamente por compatibilidad en este protocolo aún desconectado.

**Limitación:** esto reduce riesgos de carrera pero **NO garantiza revocación
instantánea ni atomicidad con PostgreSQL**. El futuro adaptador DB debe verificar
consentimiento dentro de la misma transacción/SELECT coherente con eventos y
sesiones; el mismo endpoint debe verificar en cada página. La memoria de R36
es por instancia y no es un almacén de producción multi-región.

## Prueba focalizada (sin repetir C41–C50)
`scripts/test_server_auth_consent_r38.mjs` genera JWT **firmados realmente con
RSA** en Node (claves efímeras locales), y un adaptador con el formato de la API
Supabase que verifica esas firmas. No se envía ninguna clave fuera del proceso.
Verifica manipulación del sujeto, expiración, issuer, rol, invitado, A/B, sesión
desactivada y secuencia grant → revoke → grant con incremento de versión;
además revocación durante la creación de un snapshot. Se ejecuta junto a
R36 mediante el workflow `r38-server-auth-consent.yml` si cambian sus archivos.

**No interpretar como prueba del servicio Auth real**: el Auth de ensayo
verifica las firmas RSA locales, no las claves del proyecto RutaCAP, y las
consultas de sesión/consentimiento son dobles locales todavía.

## Plan de pruebas reales A/B (requiere autorización expresa)
1. Crear migración formal, **tras autorización**, con consentimiento por usuario,
   revisión monotónica y reglas RLS, más C28/C29/R37 endurecidos. No usar la
   consola SQL real antes de revisar las operaciones y su rollback.
2. Utilizar **dos cuentas Auth permanentes autorizadas** de pruebas en RutaCAP
   (A y B) y una sesión invitada, con las políticas realmente instaladas. Jamás
   usar cuentas de CuadernoTécnico.
3. Con JWT Auth reales: validar A lee A pero no B, B lee B pero no A,
   invitado/revocación/expiración, token mal firmado, `session_id` eliminado,
   sesión restaurada y consentimiento desactivado entre páginas.
4. Leer simultáneamente eventos y sesiones con escrituras concurrentes,
   revisar transacción/orden, límite 5.000 filas y fallo controlado; comprobar
   recuperación/backup completo y ausencia de duplicados.
5. Correr Security/Performance Advisors y resolver C24
   `public.rls_auto_enable()` solamente con permiso específico.
6. Solo después, decidir preview Vercel y cambio de `cloudConfigured` por
   una autorización **independiente**; no confundir la aprobación de SQL dev
   con permiso de producción o pagos.

## Referencias actuales
- https://supabase.com/docs/reference/javascript/auth-getclaims
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://supabase.com/docs/guides/auth/signout
- https://supabase.com/docs/guides/database/postgres/row-level-security

Changelog verificado mediante el índice público y referencias actuales; no se
adopta código de migración de auth de versiones no verificadas.

**Puertas cerradas:** sin SQL real, sin llamadas a proyecto Supabase,
sin activación cloud, sin merge, sin deploy ni pago, sin scoring/banco/UI.
