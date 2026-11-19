# R42 — Session y consentimiento autenticados (19/11/2026)

**Estado:** implementación server-only offline + SQL en revisión, no aplicado. PR #21 DRAFT; main y cloudConfigured=false intactos. En esta ronda no se alteran UI, scoring, banco, Vercel ni producción.

## Preflight real sin modificaciones

El proyecto separado de Supabase `rutacap-dev` (PostgreSQL 17.12) tiene columnas `auth.sessions.id/user_id/not_after`, `auth.users.deleted_at/banned_until/is_anonymous` y `public.rc_sync_consents.user_id/purpose/notice_version/granted/revision/revoked_at`. Se inspeccionó únicamente estructura; no se han creado/modificado usuarios ni consentimientos.

## Cambios en código

- `src/serverAuthConsentGate.mjs`: después de validar `getClaims`, `getUser`, issuer, usuario, sesión y expiración, pasa el JWT **ya verificado** a los lectores inyectados `checkActiveSession` y `readConsent`. Los tests R38 previos pueden ignorar ese argumento extra.
- `src/serverAuthBackingReaders.mjs`: nuevo adaptador de solo lectura **desactivado por defecto**. En modo inactivo deniega todo sin usar red. En modo activado para un futuro backend aislado usaría únicamente URL HTTPS Supabase, clave `sb_publishable_` y JWT del usuario; no utiliza service_role, secretos ni sesión compartida.
- Comprueba actividad mediante `POST /rest/v1/rpc/rc_is_active_session_v1` sin pasar `userId` ni `sessionId` como argumentos: la DB debe deducirlos de JWT verificado por PostgREST.
- Lee consentimiento mediante `GET /rest/v1/rc_sync_consents` con RLS del propietario y exige fila única, versión `progress-sync-v1`, usuario igual al de R38, revisión válida y estado explícito.
- Falla cerrado ante falta de RPC, respuesta vacía o malformada, revocación, sesión inválida, falso propietario, errores de conexión o permisos.

## SQL R42 — NO APLICADO

`docs/commercial/sql/R42_active_session_rpc_REVIEW_ONLY.sql` propone función `rc_internal.rc_is_active_session_v1()` (SECURITY DEFINER en esquema no expuesto) que solo devuelve verdadero si la sesión del JWT sigue en `auth.sessions` y pertenece a usuario válido, no anónimo/borrado/baneado y no expirado (`not_after`). Un wrapper público SECURITY INVOKER llama al interno; se limitan permisos a `authenticated`.

**Requiere autorización SQL adicional específica y revisión del propietario y privilegios** para instalar en `rutacap-dev`. No afirmar que una comprobación de tabla garantiza revocación instantánea: firmar salida puede dejar JWT vigentes hasta `exp`; deben probarse efectos reales de `signOut(local/global)` con JWT Supabase.

## Verificación y bloqueo

`scripts/test_server_auth_backing_r42.mjs` verifica únicamente contratos offline con respuestas REST simuladas. Integrado en el workflow existente R38, sin workflow nuevo ni llamadas de prueba a Supabase real. Solo después de CI SUCCESS puede considerarse implementado el adaptador desconectado.

Pendiente: SQL R42 autorizado, cuentas A/B Auth con sesiones/JWT reales, prueba de consentimiento con dos identidades, lectura real de snapshot v2 por servidor, contrato informativo RGPD, decisión independiente de cloud/deploy.

**Preferencia de interfaz recordada:** botones y contenedores más rectangulares y menos redondeados; no cambiar UI durante estas rondas de seguridad.
