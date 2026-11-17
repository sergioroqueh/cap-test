# C32 — Estrés local y lectura remota simulada (17/11/2026)

**Ámbito:** `feat/cap-commercial`, PR #21 DRAFT. `main` y Supabase `rutacap-dev` intactos. No migraciones, despliegues, pagos ni cambios de scoring. `cloudConfigured=false`.

## Auditoría inicial del estado
La CI general del HEAD C31 `af559cd914b7546a967a7d7ff250556991ac2cf4` terminó **FAIL** exclusivamente en `Verify staged R32 evidence (no scoring changes)`, tras superar los pasos previos. C28/C29/C30/C31/C15/R26/R30/R31 estaban en SUCCESS; C7 seguía en curso en la primera comprobación. Mantener visible la discrepancia de frecuencias **2/2/1 frente a 3/3/3**, sin cambiar respuestas ni bloquear u ocultar el check.

## Hardening C32
En `src/backupRecovery.ts`:
- Eliminación de `Array.some` repetido dentro de un bucle por pregunta. La comprobación de procedencia pasa a usar conjuntos de claves (`Set`), evitando crecimiento cuadrático de CPU al restaurar muchos registros.
- Sustitución de `Math.max(...journal.map(...))` por un recorrido iterativo del reloj de eventos: elimina el posible desbordamiento de pila para historiales grandes. Se mantiene la validación de enteros seguros y el rechazo si el reloj lógico está agotado.
- **No cambia** `gradeSession`, ni la semántica de conflictos, ni la política restrictiva de backups de otro propietario.

`scripts/e2e_backup_stress_c32.mjs` crea datos sintéticos reales en IndexedDB: **2.400 preguntas, 2.400 eventos, 480 sesiones de examen con 30 respuestas cada una** (14.400 respuestas históricas en sesiones). Prueba exportación íntegra, borrado, restauración y repetición idempotente, continuación de estudio, restauración concurrente con escritura en otra pestaña y cero peticiones a Supabase. Simula **de forma determinista** un `QuotaExceededError` de `IDBObjectStore.put` tras varias escrituras pendientes, comprobando rollback sin registros parciales. Es una prueba del manejo de error y atomicidad, **NO** una simulación completa de cuotas de almacenamiento del sistema operativo.

## PostgREST solo lectura: contrato deliberadamente no desplegable
`src/postgrestReadDraft.mjs` es una prueba ejecutable **no importada** por aplicación, UI ni `db.ts`. Requiere `enabled=true`, un `fetchImpl` inyectado, un `getAccessToken` inyectado y una licencia de identidad `createAccountSyncLease` de C31. **Solo permite** origen fijo `https://rutacap-fixture.invalid`: cualquier URL real de Supabase se rechaza, incluso al activarlo en tests. No existe fallback a `fetch` global ni una API de escritura.

El lector añade cabecera `Authorization: Bearer` con JWT de **forma** comprobada (no verifica su firma, que corresponde al servidor), `apikey` ficticia y filtro `user_id` como defensa adicional. Emite únicamente GET para `rc_progress_events` y `rc_study_sessions`, con orden estable por clave, `Range`, `Content-Range` exacto, máximo de filas, validación del propietario y de las claves en cada página, rechazo de duplicados o rangos parciales y verificación de identidad antes y después de cada petición. Devuelve únicamente un conjunto completo validado por `unionRecords` / `replayProgress`; nunca aplica datos directamente.

**Limitación esencial:** las páginas HTTP individuales no forman una snapshot transaccional de PostgREST. Comprobar recuentos/rangos mitiga cambios evidentes, pero **no prueba coherencia absoluta** si el servidor puede modificar filas durante la lectura. Se necesita una estrategia de checkpoint/snapshot o keyset inmutable con garantías servidor, y pruebas reales JWT/RLS antes de cualquier acceso cloud. El SQL C28/C29 está **sin migrar** a Supabase.

`scripts/test_postgrest_read_draft_c32.mjs`: respuestas completamente simuladas; login/consentimiento, paginación, respuestas 401/403, datos ajenos, claves duplicadas, rangos incompletos o cambiantes, JWT ausente, cancelación por logout, bloqueo del host real y límite de filas.

## SQL RLS desechable
`docs/commercial/sql/C32_read_only_fixture_rls_test.sql` se ejecuta **solo** en PostgreSQL 17 efímero de CI tras los borradores `C15_auth_fixture.sql`, `C28_full_fidelity_schema_draft.sql` y `C29_event_ledger_draft.sql`; comprueba propietario A/B, JWT anónimo / claim ausente, `anon`, SELECT selectivo, ausencia de UPDATE/DELETE y preservación de `answers`. **Ninguno de esos SQL se ejecuta en el proyecto real**.

## Bloqueos antes de sincronización real
Pendientes: elegir protocolo de snapshot paginado seguro ante escrituras concurrentes, obtener autorización explícita para despliegue SQL y dos JWT de prueba con identidades separadas, evaluar seguridad y asesor de Supabase, manejo de sesión expirada y cambio de usuario en navegador, escalado y cuotas reales por dispositivo, consentimiento explícito de subida de datos, límites de tamaño por usuario y política de protección de cuentas. `cloudConfigured=false` permanece inalterable en C32.
