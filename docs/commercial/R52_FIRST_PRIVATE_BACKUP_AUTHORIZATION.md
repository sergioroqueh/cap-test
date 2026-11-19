# R52 — Autorización acotada para la primera copia privada (19-11-2026)

**SOLO PREPARACIÓN. NO EXPORTAR. NO RESTAURAR. NO EJECUTAR SQL REAL.**

## 1. Contexto y alcance
Proyecto único: Supabase **rutacap-dev**, ref `rhtbqetskghkarxhrgee`, organización RutaCAP (Free), PostgreSQL 17.12. Fuente del plan: R45/R46/R47/R48/R50. Rama `feat/cap-commercial`, PR #21 DRAFT, `cloudConfigured=false`.

La documentación oficial de Supabase distingue la exportación lógica de roles, esquema y datos mediante Supabase CLI. Los archivos SQL no garantizan por sí mismos la recuperación de archivos binarios de Storage, parámetros OAuth/GoTrue, API keys, secretos, funciones externas, historia completa de migraciones o configuraciones de proyecto. La documentación de restauración self-hosted indica que `auth.users` está incluido en el dump de la base, pero las sesiones JWT anteriores a la restauración pueden dejar de funcionar si se utilizan secretos diferentes. Los procedimientos de restauración deben considerar diferencias de versión Auth/Storage y PostgreSQL.

Referencias:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## 2. Precondiciones para autorizar la exportación, NO para R43
- Confirmar en el momento de la operación que la cuenta y el proyecto de origen son precisamente RutaCAP/rutacap-dev; no tocar CuadernoTécnico.
- Seleccionar destino local bajo control del usuario, fuera de GitHub, CI, logs, conversaciones y carpetas sincronizadas sin cifrar. Elegir cifrado en reposo y permisos mínimos, capacidad, retención y gestión de borrado.
- Comprobar versiones y ayuda actual de Supabase CLI, Docker/PostgreSQL y compatibilidad de conexión. Cualquier preparación que requiera instalar software, cambiar credenciales, crear un recurso o costes tendrá consentimiento adicional.
- Planificar método seguro para obtener y usar credenciales, evitando argumentos, historial y volcado de secretos en la terminal.
- Limitar a operaciones de lectura/exportación y escritura de **ficheros locales privados**; nada de DDL/DML en origen, cambios de Auth, usuarios, sesiones, Storage, Vercel, deploy, pagos, cloud ON o merge.
- Documentar en privado fecha/versión y bytes/SHA-256 de `roles.sql`, `schema.sql`, `data.sql`; no registrar contenidos o identificadores de usuarios en GitHub.
- No extrapolar la prueba de integridad del fichero a una restauración: un backup no se considera recuperable hasta ensayarlo en destino aislado.
- Verificar explícitamente el alcance de esquema/roles/datos, RLS, extensiones, funciones, triggers, `auth`, Storage metadata y objetos binarios, migraciones, cifrado/Vault y configuración GoTrue/OAuth. Faltas de cobertura quedan como **NO-GO para recuperación integral**.

## 3. Texto propuesto de consentimiento de fase B (NO otorgado)
> Autorizo exclusivamente la exportación lógica de solo lectura de la base Supabase **rutacap-dev** (`rhtbqetskghkarxhrgee`) de la organización RutaCAP, con la herramienta y versión previamente verificadas, para generar en un almacenamiento local privado cifrado previamente acordado los ficheros `roles.sql`, `schema.sql` y `data.sql`, más su manifiesto local de tamaños y SHA-256. Autorizo únicamente lectura de los datos necesarios y escritura de esos archivos en el destino local acordado. No autorizo cambios de esquema o datos, nuevas cuentas, sesiones, reset de contraseñas, subida a repositorios o CI, exportación adicional de objetos Storage, recursos de pago, restauraciones, cloud ON, Vercel, deploy, merge ni instalación de R43. Si falta una precondición, detenerse antes de ejecutar.

Este texto **no sustituye** la selección del almacenamiento cifrado, método seguro de credenciales y verificación de la herramienta y del alcance. Aprobación de B solo mediante mensaje posterior inequívoco.

## 4. Fase C — Restauración independiente
Requiere autorización posterior y separada del destino concreto, presupuesto cero o costes aprobados, aislamiento y verificación inequívoca de la conexión. Ensayar los SQL contra un entorno desechable PostgreSQL 17/Supabase compatible, con detención ante errores; una prueba PostgreSQL sola no demuestra servicio completo Auth/Storage. No usar de destino `rutacap-dev` ni producción. No crear todavía este entorno.

## 5. Fase D — R43
No aplicar `docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql` sin respaldo recuperable demostrado, preflight R45 repetido y nueva autorización expresa. No ejecutar R45 postflight ahora. Security Advisor `rls_auto_enable()` y leaked password protection siguen pendientes de otro permiso.

## 6. Cierre de R52
Revisión documental y autorización redactada. Sin nuevas baterías sintéticas. Estado R52 ≠ permiso de exportación. No se inspeccionó ni modificó la base real. La CI de la rama posterior a este cambio documental se verificará por separado.
