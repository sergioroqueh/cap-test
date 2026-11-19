# R46 — Auditoría de respaldo y función privilegiada (19-11-2026)

**Estado: AUDITORÍA READ-ONLY; R43 NO AUTORIZADA / NO APLICADA.**

## Evidencia observada
- Supabase RutaCAP `rutacap-dev` (`rhtbqetskghkarxhrgee`): ACTIVE_HEALTHY, PostgreSQL 17.12; organización RutaCAP en plan Free.
- No se ha acreditado ninguna copia recuperable. El plan y el tamaño de la base **no** prueban existencia ni ausencia de copias externas. No se ha realizado exportación ni restauración.
- `public.rls_auto_enable()`: owner `postgres`, SECURITY DEFINER, `search_path=pg_catalog`, retorna `event_trigger`. Recorre comandos CREATE TABLE/CREATE TABLE AS/SELECT INTO y habilita RLS en tablas de `public`, con manejo de excepciones. `has_function_privilege` confirma EXECUTE para `anon` y `authenticated`. No se probó invocación RPC; la concesión no demuestra ejecución exitosa de una función que retorna `event_trigger`.
- Security Advisor: avisos 0028 (anon EXECUTE), 0029 (authenticated EXECUTE), protección de contraseñas filtradas desactivada. Ninguna corrección aplicada.
- GitHub compare antes del commit: rama feat/cap-commercial ahead 283, behind 0 respecto de main d979ecac504f2099b885a2d2a371c070ef4fb808.

## Respaldo: criterio de desbloqueo
1. Consultar en el panel privado Database > Backups si existe un punto de restauración y qué cubre; no asumir backups automáticos en Free. Documentación: https://supabase.com/docs/guides/platform/backups
2. Si no existe copia verificable, solicitar permiso separado para exportación lógica privada, incluyendo esquema, roles/configuración necesarios y tratamiento explícito de Auth/Storage y secretos. Evitar repositorios, CI y logs para los dumps.
3. Probar restauración aislada y validar tablas, políticas, funciones, conteos y Auth según alcance, sin tocar rutacap-dev. Registrar fecha, herramienta, cifrado/ubicación privada y resultados, nunca credenciales.
4. Solo después: autorización específica de R43, preflight nuevamente y postflight según R45.

## Remediación independiente propuesta (NO EJECUTAR)
- Inventariar dependencias del event trigger y grants exactos. Confirmar el mecanismo que lo instaló antes de alterar la función.
- Evaluar retirar EXECUTE de PUBLIC, anon y authenticated de `public.rls_auto_enable()`, conservando el uso administrativo del event trigger; validar primero en Postgres desechable y volver a consultar advisors. No cambiar a SECURITY INVOKER ni borrar la función sin verificar impacto.
- Revisar por separado la protección de contraseñas filtradas y compatibilidad con el plan. Requiere autorización de configuración Auth.
- Referencias: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable y https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Restricciones conservadas
No SQL DDL/DML real, no R42/R43, no cuentas ni sesiones, no cloud ON, Vercel, merge, pagos, scoring, banco o UI. No pruebas locales solicitadas. R46 no sustituye una prueba de recuperación.
