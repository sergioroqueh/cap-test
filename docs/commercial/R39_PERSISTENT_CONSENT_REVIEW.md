# R39 — Consentimiento persistente y RLS propuestos (19/11/2026)

**Estado:** borrador de revisión, **NO MIGRACIÓN EJECUTADA**. PR #21 DRAFT en feat/cap-commercial. No se ha consultado ni modificado Supabase real, ni desplegado. cloudConfigured=false. No se conecta ninguna función nueva a Vite, a un servidor real ni a Vercel.

## Hallazgo de R38 → R39

R38 verifica criptográficamente JWT en un doble local, comprueba sesión y consentimiento mediante dependencias inyectadas y ata snapshots a sessionId + consentRevision. R37, sin embargo, solo comprobaba propietario y anonimato dentro del SELECT SQL; además, C28/C29 permiten a authenticated usar directamente SELECT/INSERT/UPDATE sin consentimiento. Por eso no basta con crear una tabla: hay que reforzar también las políticas de los datos y retirar el EXECUTE antiguo de R37.

## Archivos propuestos

- SQL íntegro de revisión: docs/commercial/sql/R39_persistent_consent_review.sql.
- Dependencias de orden: C28, C29 y R37 (todos aún borradores). No aplicar R39 aislado ni ejecutar ninguna de estas propuestas sin autorización específica en un entorno de desarrollo.

## Contrato de consentimiento

- Un registro por usuario y propósito fijo progress-sync; el usuario se deduce de auth.uid() en servidor, jamás de argumentos del navegador.
- Conceder exige versión de aviso explícita progress-sync-v1. No se interpreta un inicio de sesión, alta de cuenta, restauración de backup o uso de la aplicación como consentimiento.
- Revocar conserva la fila y avanza la revisión de manera monotónica; volver a conceder incrementa otra vez la revisión. Repeticiones de la misma operación son idempotentes. No se admite poner manualmente la revisión ni borrarla desde la PWA.
- Una tabla separada registra los cambios grant/revoke en la misma transacción. Solo el propietario puede leer su historial; el cliente no tiene permisos de INSERT/UPDATE/DELETE en ninguna de las dos tablas.
- Dos funciones SECURITY DEFINER en el esquema interno rc_internal (no expuesto por PostgREST) encapsulan las transiciones. Dos RPC públicos SECURITY INVOKER las invocan con permisos restringidos. Fijan search_path vacío, llaman auth.uid()/auth.jwt(), rechazan anónimos y roles distintos de authenticated y no aceptan user_id. El propietario privilegiado de esas funciones debe revisarse antes de instalar; un service_role o SQL admin nunca debe residir en el cliente.
- La versión fija del aviso es un marcador contractual: antes del consentimiento real habrá que revisar el texto informado, su versión, privacidad, plazo de retención y tratamiento de borrado de datos. La llamada RPC no prueba por sí sola que una persona haya visto o aceptado un texto: eso depende del flujo de consentimiento futuro.

## Protección de datos con RLS

- RLS sobre el registro de consentimiento y auditoría: SELECT propio y solo para authenticated no anónimo; escrituras exclusivas de las funciones controladas.
- Políticas de C28/C29 para perfiles, progreso, sesiones y eventos: exigir propietario **y consentimiento vigente** para lectura/escritura; así la revocación también bloquea accesos directos autenticados de sincronización.
- Función SECURITY INVOKER rc_has_active_progress_sync_consent_v1: evaluación false si falta fila, versión de aviso, rol o consentimiento. No hay elevación en este helper.
- Se propone retirar EXECUTE de rc_read_consistent_snapshot_v1 (R37) y sustituirlo por rc_read_consistent_snapshot_v2(revision, session_id): una sentencia SQL STABLE que exige sesión del JWT y revisión del consentimiento y lee eventos + sesiones coherentemente, con límite 5.000 filas por recurso. Un NULL es denegación/error controlado; nunca debe convertirse en snapshot vacío.
- Si se revoca durante un SELECT ya iniciado, PostgreSQL MVCC puede conservar la visión anterior hasta terminar la sentencia. Por eso R38 seguirá revalidando después de materializar y antes de entregar; **no se promete revocación instantánea ni linealizabilidad**. Cerrar de forma estricta esa carrera requiere una decisión de bloqueo/serialización adicional antes de producción.

## Adaptadores todavía ausentes

**No existe un backend real** para createAuthClient, checkActiveSession, readConsent ni takeConsistentSnapshot. Este último todavía recibe solo userId en R36, por lo que **no se puede conectar a R39 v2 tal cual**: en una ronda posterior deberá recibir o reconstruir de forma validada sessionId + consentRevision, usar JWT del mismo usuario en PostgreSQL/PostgREST, exigir respuesta no nula y volver a comprobar la identidad por página. El server no debe confiar en parámetros enviados por el cliente como prueba de identidad.

La revocación detiene futuras lecturas/escrituras de sincronización según estas políticas, pero no borra automáticamente los datos ya almacenados. La eliminación, exportación, retención y tratamiento de cuentas se diseñarán separadamente antes de activar cloud.

## Autorización necesaria para las primeras pruebas reales A/B

Solicitud concreta pendiente al usuario, **NO otorgada**:

1. Permitir exclusivamente sobre el proyecto de desarrollo RutaCAP la aplicación de un conjunto SQL ya revisado (C28, C29, R37 endurecido/R39 y dependencias), con copia/preflight, rollback documentado y sin tocar otros proyectos Supabase.
2. Permitir dos identidades de prueba de Supabase Auth de RutaCAP, A y B, creadas o identificadas con su consentimiento, y una sesión anónima de contraste, para leer/escribir solo datos ficticios con JWT reales.
3. Validar: sin consentimiento se deniegan tanto RPC como tablas; grant A no da acceso a B; revocación A bloquea A sin tocar B; re-grant incrementa revisión; un snapshot antiguo nunca se reabre; expiración/rotación de JWT y cierre real de sesión; historial sin modificaciones cliente; 5000/5001 filas; concurrencia entre revocar y leer; ausencia de escritura cruzada.
4. Revisar Security Advisor, privilegios, RLS, restricciones, trazabilidad, coste/rollback, error handling y aislamiento real. Ninguna prueba A/B sintética reemplaza las pruebas del servidor Auth real.

**La autorización de SQL dev NO autoriza** deploy, preview Vercel, merge, cambio de cloudConfigured, producción, pagos ni modificaciones del banco, scoring o interfaz.

## Decisión de esta ronda

R39 solo entrega SQL y documentación revisables, sin tests sintéticos nuevos ni workflows adicionales. No considerar PASS funcional: el SQL no se ha ejecutado en PostgreSQL 16 ni contra Supabase Auth real. Mantener PR DRAFT y main intacta.
