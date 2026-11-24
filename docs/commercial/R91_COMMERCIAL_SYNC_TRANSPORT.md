# R91 — Transporte comercial de sincronización (24/11/2026)
Rama de oficina feat/rutacap-office-20261124; base R90 13857e964816e0f4ab8298e5735c3ebbbe7aa353. Sin despliegue, sin migración ni cambios Auth, sin pagos. cloudConfigured=false.

## Implementación
- Transporte PostgREST acotado al proyecto exclusivo, JWT explícito por petición (no credenciales privilegiadas), sin caché ni redirecciones; fija propietario, sesión y revisión de consentimiento; revalida antes/después de la red. Las respuestas nulas o de otra cuenta fallan, no se interpretan como historial vacío.
- Lectura consistente mediante rc_read_consistent_snapshot_v2; consentimiento persistente rc_sync_consents, propósito progress-sync, aviso progress-sync-v1. El adaptador NO concede consentimiento automáticamente.
- Eventos y sesiones insert-only, claves compuestas del propietario, sin UPDATE/DELETE, con comparación semántica antes de insertar y lectura de confirmación después. Los IDs numéricos no viajan. Unión/replay de C29 y fusión IndexedDB R35; sin sumar agregados de distintos dispositivos. rc_question_progress queda como proyección futura, no fuente de verdad; no se escribe perfil/consentimiento/auditoría por esta ronda.
- Coordinador no montado en App y RELEASE_APPROVED=false. El flag heredado cloudConfigured permanece intacto.
- scripts/test_commercial_sync_r91.mjs: 13 casos sintéticos del transporte, ejecutados con las funciones exactas en el entorno de herramientas; CI Node/TS/build y E2E aún pendientes.

## Lecturas reales realizadas
Metadatos de las seis tablas de sincronización en rutacap-dev: RLS activa. Consultas SELECT de pg_policies, pg_proc, pg_constraint: políticas owner-only, no anónimo, consentimiento activo; eventos y sesiones con SELECT/INSERT, sin UPDATE; RPC snapshot v2 exige revisión, session_id del JWT, límite de 5000 filas de cada tipo y devuelve NULL fuera de contrato. No se leyeron filas de estudiantes, no se concedió consentimiento, no se escribieron datos.

## Bloqueos explícitos antes de habilitar
1. Los INSERT directos están protegidos por RLS, pero no fijan revisión de consentimiento en la misma transacción. La revocación/re-concesión entre comprobación y escritura y un JWT previamente emitido no se eliminan por comprobaciones cliente. Preparar RPC de ingestión atómica con sesión activa/revisión, owner derivado de auth.uid(), comparación idempotente y límites. No desplegar sin autorización.
2. El snapshot limita 5000 eventos y 5000 sesiones; no truncar ni tratar NULL como vacío. Hace falta estrategia paginada/compactación autorizada antes de uso prolongado. Las escrituras por lotes pueden quedar parcialmente confirmadas; el diario local se conserva y el reintento compara contenido.
3. Consentimiento informado UI, revocación, política de retención/borrado y pruebas reales con A/B, sesión cerrada y carreras entre dispositivos, incluyendo cambio de perfil durante la fusión local. No se afirma aislamiento real A/B por pruebas de dobles.
4. No activar el coordinador ni vender sync como operativa hasta superar estos bloqueos y CI; verificar entitlement de sync según plan al definir P3. Las cuotas y los JSON públicos siguen siendo bloqueos independientes.
