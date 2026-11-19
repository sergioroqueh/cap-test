# R50 — Runbook operativo de respaldo privado (PREPARACIÓN; NO EJECUTAR)

Fecha: 19-11-2026. **Estado: PLAN ONLY**. Sin SQL sobre rutacap-dev, sin exports/restores, sin cambios de Auth, Vercel, producción, cloud o UI.

## Destino y propósito
Origen únicamente para **futura** ejecución autorizada: Supabase dev `rutacap-dev` (ref `rhtbqetskghkarxhrgee`), PostgreSQL 17.12, plan Free. No consta respaldo recuperable. `docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql` permanece bloqueado.

## Paso 0 — Preparación sin tocar datos
- Confirmar el proyecto de origen y pertenencia a la organización RutaCAP, sin reutilizar conexiones de CuadernoTécnico.
- Consultar **en el momento autorizado** `supabase --version` y `supabase db dump --help`, documentación vigente, versión `psql`, Docker y rutas privadas.
- Elegir carpeta **fuera del repositorio y de carpetas sincronizadas sin cifrado**, volumen cifrado y control de accesos. Verificar espacio y plan de retención y destrucción, sin publicar la ubicación real.
- En GitHub solo guardar instrucciones y tests **sintéticos**. Ni ejemplos con connection strings válidas, ni nombres de dumps reales, ni metadatos de usuarios.
- No se proporcionan scripts ejecutables para volcar la base: la operación futura requiere una aprobación distinta y una revisión de versión/configuración.

## Puerta 1 — Exportación (requiere permiso explícito separado)
La guía oficial de Supabase CLI describe un juego de **tres** exports SQL: roles `--role-only`, esquema y datos `--data-only --use-copy`. La guía actual menciona exclusiones especiales para algunas tablas de Storage vectorial. No asumir que estas tres piezas contienen TODO: confirmar en la CLI/versión efectiva el alcance exacto por esquema y la preservación de ownership/privilegios. Evitar cambiar contraseña para realizar el export sin permiso expreso.

En el momento de la aprobación: confirmar con usuario el almacenamiento cifrado privado; definir método de entrega de credenciales **sin impresiones ni shell history**; generar exports de lectura y calcular **SHA-256 y bytes reales de cada fichero**, guardando el manifiesto solo en ubicación privada; comprobar que ninguno acaba en GitHub/PR/CI/chat. Un checksum no es una restauración exitosa.

## Puerta 2 — Inventario de alcance (puede requerir permisos adicionales)
Registrar por separado, con evidencia privada, cobertura/ausencia justificada de:
- esquema, datos comerciales y Auth persistente; seis tablas comerciales y sus conteos; RLS, doce políticas y ACL
- Storage metadata versus **archivos binarios externos**; un backup SQL no contiene los objetos de Storage API
- historial `supabase_migrations` (requiere atención especial según documentación)
- funciones, event triggers, extensiones, webhooks, publicaciones/Realtime
- configuraciones Auth OAuth/Google y secretos; root encryption key, Vault y cifrado de columnas
- roles custom LOGIN, contraseñas y posibles dependencias de entorno
No volcar secretos a logs. Identificar exclusiones de forma explícita y detenerse si afectan a la recuperabilidad.

## Puerta 3 — Restauración aislada (SEGUNDA aprobación independiente)
Aprobar destino *diferente* y desechable; validar host/ref, región, acceso y costes antes de crearlo. PostgreSQL 17 genérico permite pruebas de SQL, pero **no certifica recuperación integral de Auth/Storage/GoTrue**. Restaurar únicamente en destino autorizado con `ON_ERROR_STOP` y control transaccional conforme a la guía vigente, sin apuntar al origen bajo ninguna circunstancia. No ejecutar comandos automáticos ni migraciones reales desde GitHub.

Después, comparar esquema, grants, roles, funciones, RLS, conteos, políticas, migraciones y componentes Auth/Storage que hayan sido incluidos. Documentar los fallos y límites; no aceptar un PASS si depende de secretos ausentes, cifrado sin restaurar, archivos Storage ausentes, sesiones no verificadas o diferencias de permisos.

## Puerta 4 — R43: aprobación completamente nueva
Incluso con restauración aislada validada, la prueba de backup **no** autoriza la instalación de R43. Repetir preflight de R45, comparar fingerprints/HEAD y recibir consentimiento específico para el archivo y el proyecto. R45 postflight continúa sin ejecutar.

## Guardas automatizadas introducidas
`scripts/test_r50_backup_operational_plan.mjs` no lee variables de entorno, dumps, ficheros ni red; no ejecuta procesos externos. Compara únicamente un fixture sintético en memoria y exige:
- proyecto y destino `fixture.invalid`;
- inventario completo y separado de once superficies de cobertura;
- planificación de almacenamiento cifrado privado;
- fases con aprobación diferenciada de exportación, restauración y R43;
- estado invariable `canExport=false`, `canRestore=false`, `canApplyR43=false`.

**No interpreta fixtures como evidencia de una copia real.** La CI solo comprueba que este mecanismo de planificación no autoriza operaciones.

## Referencias oficiales
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Límites y bloqueos vigentes
R43 sin aplicar; sin copia recuperable acreditada. Pendientes y fuera de alcance los avisos de Security Advisor (SECURITY DEFINER `public.rls_auto_enable()` ejecutable por anon/authenticated, leaked password protection desactivada). No solicitar pruebas al usuario durante su jornada laboral.
