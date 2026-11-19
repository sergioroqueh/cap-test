# R43 · Seguridad de revocación directa y plan Auth A/B (19/11/2026)

**Estado:** auditoría cerrada y SQL de corrección preparado, **NO APLICADO**. PR #21 OPEN DRAFT. `main` y `cloudConfigured=false` permanecen intactos. Usuario trabajando: ninguna acción en su ordenador ni solicitud de secretos.

## Hallazgo material

La base de desarrollo `rutacap-dev` mantiene 12 políticas RLS comerciales y ninguna referencia a la verificación de sesión activa, mientras la función R42 aún no existe allí. R38 verifica la sesión en el servidor cuando recibe peticiones por su ruta, pero Supabase también expone, por sus propios permisos + RLS, las tablas `rc_*` y las RPC de consentimiento. Un JWT ya emitido puede seguir siendo válido hasta su expiración incluso si la sesión fue cerrada; una sesión inexistente debe bloquear también esas vías directas.

Concretamente, R39 valida identidad, consentimiento y revisión; **no exige pertenencia vigente a `auth.sessions`** en las lecturas directas ni en las funciones con privilegios de grant/revoke. Este es un fallo de diseño de revocación, no evidencia de exfiltración ni de usuarios afectados: las tablas comerciales siguen vacías.

## Remediación diseñada

`docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql` es un **único paquete propuesto** (BEGIN...COMMIT) que:
1. Instala la función R42 `rc_internal.rc_is_active_session_v1` y su invocador público; no expone `auth.sessions` a los roles cliente.
2. Refuerza RLS de `rc_sync_consents` y `rc_sync_consent_audit` con verificación de sesión vigente, además de titularidad.
3. Añade el requisito de sesión activa al helper `rc_has_active_progress_sync_consent_v1` consumido por las 10 políticas de perfiles, progreso, eventos y sesiones comerciales.
4. Añade la misma comprobación a las funciones internas SECURITY DEFINER de conceder/revocar; conservar rol, propietario, avisos de consentimiento y revisiones.
5. Mantiene los grants denegados para `PUBLIC`, `anon` y `service_role` en las superficies revisadas.

**Importante:** no ejecutar R42 suelto: usar el paquete R43 completo y atómico después de revisión y autorización concreta para desarrollar. No hay una migración nueva aplicada en esta ronda.

## Limitación de garantía

Incluso con esta remediación, un SELECT iniciado antes de la revocación puede terminar conforme a su snapshot MVCC; no prometer cancelación retrospectiva de sentencias en curso. El servidor R38 revalida consentimiento y sesión después de materializar el snapshot y por página. La prueba real deberá comprobar la semántica exacta de `signOut(local/global)` y cambios de sesión en `auth.sessions`.

## Protocolo A/B futuro: todavía sin ejecutar

**Precondiciones:** autorización SQL específica de R43 sobre `rutacap-dev`; segundo usuario de prueba real bajo control voluntario; JWT emitidos por Supabase Auth (no fabricados mediante GUC), dos navegadores/perfiles independientes y respaldo de cualquier progreso local antes de activar funciones de recuperación.

Secuencia de aceptación:
1. A y B autentican por separado; comprobar propietario, `session_id` y roles con sus JWT verificados.
2. Sin consentimiento: ambos reciben 0 filas en lecturas directas, RPC snapshot v2 nula, sin inserciones.
3. Consentimiento informado individual: solo A concede; comprueba revisión 1 y auditoría, B permanece sin acceso.
4. A crea un evento **ficticio separado**; A lee el suyo por RPC y REST directo, B no lee ni modifica el de A.
5. Rechazar tokens falsificados, audiencia incorrecta, expiración, invitado, usuario ajeno, sesión cruzada.
6. Ejecutar signOut de A (local y después, en caso de cuentas separadas, global): con el JWT previo aún en rango `exp`, exigir denegación de REST directo, RPC snapshot y grant/revoke y lectura de consentimiento.
7. Con nueva sesión de A, probar revocación del consentimiento, regrant con revisión incrementada, y que un snapshot con revisión anterior no resucita.
8. Comparar auditoría, contenido, índices y performance; no tocar datos históricos reales ni producción. Restos ficticios de la prueba se eliminan solo con procedimiento autorizado.

**Bloqueadores:** no existe segunda identidad Auth de prueba; no se dispone de una sesión JWT Auth real en estas herramientas; no se han modificado contraseñas ni sesiones. Probar SQL con `set_config('request.jwt.claims')` solo simularía claims, no constituye A/B real.

## Verificación R43

`scripts/test_server_session_rls_r43.mjs` es una única aserción de integridad **estática**, integrada en el workflow R38 existente. Verifica que el borrador atómico incluye las barreras de sesión de las superficies requeridas. **NO** equivale a validar sintaxis PostgreSQL ni a reproducir revocación Auth real.

Siguiente decisión concreta: autorizar **solo la instalación en rutacap-dev** del paquete de SQL R43, después de una revisión adicional de seguridad del propio script. Mantener prohibidos cloud ON, deploy, merge, producción, scoring, banco y cambios UI.

**Preferencia visual futura:** botones, tarjetas y contenedores con esquinas más rectangulares y menos redondeadas; reservar para ronda de diseño independiente.
