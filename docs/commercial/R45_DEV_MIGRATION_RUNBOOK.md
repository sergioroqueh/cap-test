# R45 — Runbook de autorización de R43 (19-11-2026)

**ESTADO: PREPARADO; NO INSTALADO.** Esta ronda solo ha realizado consultas de solo lectura en Supabase y cambios de archivos en la rama comercial. `main`, `cloudConfigured=false`, Vercel, scoring, banco de preguntas e interfaz intactos.

## 1. Destino y línea base confirmada

**Proyecto exclusivo:** Supabase `rutacap-dev` / `rhtbqetskghkarxhrgee`, región `eu-west-1`, `ACTIVE_HEALTHY`, PostgreSQL 17.12; conexión Supabase **RutaCAP**, nunca CuadernoTécnico. Migración previa única: `20261119073246_rutacap_r39_dev_schema_consent_20261119`. Seis tablas comerciales `rc_*` con RLS y 12 políticas. Cero filas en **las seis** tablas (perfiles, progreso, sesiones de estudio, eventos, consentimientos, auditoría). Cero funciones de sesión activa R42. R44 pasó sintaxis/propietario/RLS con PostgreSQL 17 desechable: GitHub Actions #44490714591 SUCCESS.

El script `docs/commercial/sql/R45_PREFLIGHT_READ_ONLY.sql` es un único SELECT: verifica nombres, versión, 6 RLS, 12 políticas, propietario de funciones internas, ACL, cero R42, conteos de las seis tablas y fingerprints de definiciones. Guardar resultado privado e identificar cualquier deriva antes de ejecutar. **Fingerprints MD5 son detector de cambios, NO backup ni prueba de autenticidad.**

## 2. Bloqueador de copia de seguridad

**NO se ha podido verificar una copia recuperable para el proyecto**. No equiparar los fuentes GitHub o los hashes de definiciones con una copia de seguridad de la base, y recordar que también hay datos de Supabase Auth. Antes de instalar R43, comprobar el estado real en **Database > Backups** de Supabase y una vía recuperable probada; si el proyecto no tiene backups automáticos, preparar una exportación/backup autorizado, protegido y probado de forma privada. Nunca almacenar volcados, tokens, secretos, información identificable o claves en GitHub, PR ni logs de CI.

Referencia: https://supabase.com/docs/guides/platform/backups

**NO-GO:** si no se confirma un respaldo recuperable, si el preflight difiere, si hay datos nuevos, migraciones inesperadas, permiso del rol distinto, cambios de HEAD o avisos críticos nuevos, NO aplicar SQL.

## 3. Avisos preexistentes de seguridad, separados

Supabase Security Advisor de este proyecto informa de:
- `public.rls_auto_enable()` SECURITY DEFINER ejecutable por `anon` y `authenticated` (una función pública no relacionada con R43). Revisar por separado antes de habilitar acceso público. https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Protección de contraseñas filtradas desactivada en Auth. Revisar antes de una fase pública. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

No modificar en R45 y no confundir con problemas que R43 vaya a resolver.

## 4. Consentimiento de ejecución — solo más adelante

Pulsar «Continuar» **NO** autoriza migraciones. Si se cumplen todos los controles anteriores, obtener permiso separado que indique proyecto y archivo exactos. Texto propuesto:

> Autorizo exclusivamente la instalación atómica de `docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql` en `rutacap-dev` (`rhtbqetskghkarxhrgee`), tras verificar copia recuperable, preflight sin desviaciones y versión exacta en GitHub. Autorizo únicamente comprobación posterior de metadatos, sin crear usuarios, modificar datos comerciales, activar nube, desplegar Vercel, pagos ni merge.

La operación permitida después sería **un único paquete SQL transaccional BEGIN...COMMIT** de R43 completo, no R42 suelto, con el mecanismo de migración Supabase acordado. Detener en cuanto cambie una precondición, y no ejecutar DML ni nuevas funciones ajenas al archivo. Documentar versión, owner, duración, resultado y auditoría sin JWT.

## 5. Postflight y recuperación

`docs/commercial/sql/R45_POSTFLIGHT_READ_ONLY.sql` es otro SELECT, **NO ejecutar antes de instalar R43 con permiso**: verifica las dos funciones de sesión, propietario interno/SECURITY DEFINER, wrapper SECURITY INVOKER, ACL sin anon/service, las 12 políticas, barreras en dos políticas directas y helper de las otras diez, barreras dentro de grant/revoke, seis RLS y conteos inalterados. Repetir Supabase Advisors y comparar con la línea base, sin corregir avisos preexistentes de manera improvisada.

Error durante ejecución antes de COMMIT -> rollback transaccional. Si se ha confirmado la transacción y falla postflight, **no ejecutar DROP/rollback improvisado ni restaurar automáticamente el proyecto**: suspender activaciones y evaluar reparación puntual o recuperación verificada con nueva aprobación. Un restore global puede alterar usuarios/sesiones Auth reales.

## 6. A/B con Supabase Auth genuino: otra aprobación

El test R44 simuló claims mediante `set_config`; **no firma JWT** ni ensaya `signOut(local/global)` en GoTrue. Después de instalación y postflight: autorización específica para cuentas de prueba A/B; registrar solo resultados (nunca tokens), probar consentimiento, propietario, aislamiento B, RPC vs REST directo, cierre de sesión, JWT anterior, revisión revocada y nueva sesión. Prohibido utilizar usuarios reales existentes sin consentimiento explícito. Limpieza de datos sintéticos también por autorización acotada.

## 7. Estado

R45 es preparación operativa, no autorización de R43 ni validación con autenticación real. La preferencia futura de diseño es UI más recta/cuadrada y menos redondeada, sin retoques en rondas de seguridad.
