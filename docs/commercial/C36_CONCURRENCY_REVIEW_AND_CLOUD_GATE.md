# C36 — Auditoría de concurrencia y puerta de nube (18/11/2026)

Estado: **diseño de pruebas, no evidencia de ejecución**. Solo rama `feat/cap-commercial`, PR #21 DRAFT. No Supabase real, migraciones, cloud, merge, deploy, pagos ni scoring.

## Revisión de C35

C35 usa `pg_advisory_xact_lock(hashtextextended(owner,35001))` para serializar creaciones por propietario y comprueba cuotas y existencia dentro de la función. C35 ejecutó pruebas secuenciales; no prueba dos conexiones concurrentes. C34 controla visibilidad mediante RLS, `auth.uid()`, `is_anonymous=false` y TTL. Las funciones de mantenimiento no están disponibles para roles web.

**Riesgo a resolver antes de producción:** un `REPEATABLE READ` iniciado antes de esperar un advisory lock puede mantener una fotografía MVCC anterior al commit de otro creador. El lock serializa ejecución, pero no garantiza que el conteo posterior vea la instantánea recién confirmada. La prueba de dos creadores debe forzar precisamente ese intercalado, no solo lanzar procesos simultáneos. Evaluar `READ COMMITTED` con bloqueo por propietario, o un registro de cuota por propietario bloqueado con `SELECT FOR UPDATE`, y garantizar que la materialización se ancle a una sola vista consistente. No promocionar C35 sin resolver esta tensión.

## Matriz obligatoria con conexiones PostgreSQL independientes

1. **Dos begin distintos, mismo A, una plaza restante:** conexión 1 obtiene lock y queda retenida antes de commit; conexión 2 empieza, espera; al liberar conexión 1, solo una creación adicional debe prosperar. Repetir con transacciones `READ COMMITTED` y `REPEATABLE READ`, verificando número final de manifiestos y filas.
2. **Mismo snapshotId/checkpoint, dos conexiones:** exactamente un `created`, otro `existing`; checksum, ordinales y cardinalidad idénticos, sin duplicados.
3. **Mismo snapshotId, checkpoint distinto:** una creación y un `SNAPSHOT_ID_COLLISION`; sin filas ajenas.
4. **A y B concurrentes:** no deben bloquearse por cuota de otro propietario ni ver manifiestos/páginas cruzados con JWT de `authenticated`.
5. **Cleanup contra lectura paginada:** lector obtiene página 1, mantenimiento expira y borra manifiesto, lector solicita página 2: debe devolver error explícito de snapshot expirado, nunca datos de otro snapshot ni éxito silencioso. Probar también una lectura en transacción larga para detectar semántica de `now()` fija al inicio.
6. **Expiración a mitad de lectura:** si TTL vence entre solicitudes HTTP, no se promete continuidad; cliente aborta y solicita nuevo snapshot, valida checkpoint, reinicia páginas desde cero y no mezcla generaciones.
7. **Cleanup contra begin:** borrar solo expirados, no borrar snapshot recién creado ni dejar huérfanos.
8. **Cuotas concurrentes:** superar filas/bytes/activos debe fallar sin manifiesto parcial; verificar rollback y tiempos de espera.
9. **Permisos y JWT:** A, B, `anon`, JWT anónimo, claim ausente, owner UUID falsificado, `INSERT/UPDATE/DELETE` cliente, EXECUTE de mantenimiento denegado. Las pruebas de rol simulado no sustituyen validación real del JWT por gateway.
10. **Errores:** lock timeout, statement timeout, conexión cortada, reintento tras commit incierto, limpieza concurrente e ID reutilizado después de TTL.

## Contrato propuesto (NO API activa)

- `begin`: backend verifica identidad JWT, consentimiento y cuota; genera/acepta idempotency key segura, fija un snapshot consistente, responde `snapshotId`, `checkpoint`, `expiresAt`, conteos y límites.
- `page`: consulta limitada por usuario y snapshot, cursor `stream + ordinal`, tamaño acotado; respuesta con checkpoint inmutable y `nextCursor`; rechazo explícito si caducó o cambió propietario.
- `finish`: cierre idempotente, no borra datos del usuario; liberación/retención con política definida.
- El cliente valida propietario, checkpoint, secuencia, integridad y cardinalidad antes de confirmar restauración; nunca mezcla snapshots. Logout aborta el proceso.

## Condiciones para autorizar una futura fase cloud

Pruebas de conexiones auténticas con resultados reproducibles en CI PostgreSQL efímero; aislamiento A/B y autenticación JWT end-to-end; solución probada de consistencia MVCC y cuotas; presupuesto y límites reales; protección contra abuso y observabilidad sin datos sensibles; consentimiento explícito; estrategia de migración reversible; pruebas físicas iOS/Android y accesibilidad; resolución editorial R32 2/2/1 frente a 3/3/3 por evidencia. Cada autorización deberá ser explícita y separada.

## Evidencia pendiente

No se han ejecutado todavía los escenarios de concurrencia de C36. No declarar PASS ni crear un workflow de apariencia verde que solo ejecute fixtures secuenciales. C35 SUCCESS 44260439620; Validate CAP FAILURE por evidencia R32, no modificar scoring.

## Resultado ejecutado de C36 — 18/11/2026

**Evidencia CI:** GitHub Actions [#44262800203](https://github.com/sergioroqueh/cap-test/actions/runs/44262800203), job `multi-session-disposable`, PostgreSQL 17 efímero con `psycopg` y sesiones físicamente distintas. Script: `scripts/test_snapshot_concurrency_c36.py`. **11 aserciones PASS**. No se ha conectado a Supabase real.

- **Defecto reproducido**: con `REPEATABLE READ`, dos snapshots distintos creados simultáneamente por A sobre una plaza libre devolvieron ambos `created` y dejaron **3 activos pese a máximo 2**. La segunda transacción había tomado su snapshot MVCC antes de adquirir el advisory lock. Por tanto, el bloqueo de C35 **no garantiza** la cuota bajo ese aislamiento.
- **Mitigación candidata verificada**: con `READ COMMITTED` en el mismo intercalado, primera `created`; segunda `ACTIVE_QUOTA`; quedaron **2 activos**.
- Mismo `snapshotId` concurrente: `created` + `existing`, exactamente un manifiesto.
- Checkpoint diferente con igual ID: `SNAPSHOT_ID_COLLISION`.
- JWT sintético B no puede leer A; `authenticated` no ejecuta cleanup; snapshot expirado no expone filas y cleanup borra en cascada.
- Verificada en CI la cadena desechable C15/C28/C29/C34/C35 y `cloudConfigured=false`.

**Precisión importante:** los 11 PASS incluyen una **demostración positiva del defecto** de C35, no equivalen a declarar segura la función C35 bajo todas las condiciones. `READ COMMITTED` es solo una posible mitigación, aún sin cierre de protocolo end-to-end. La materialización de origen y las comprobaciones de cuota deben tener semántica coherente ante escrituras de origen concurrentes. No se ha probado JWT validado criptográficamente por gateway ni paginación HTTP real.

**Pendiente para cierre:** prohibir explícitamente el aislamiento inseguro en el diseño backend, comprobar lectura multipágina frente a cleanup en conexiones independientes y transacciones largas (`now()` no avanza dentro de una misma transacción), límites y timeouts bajo carga, y resolver coherencia entre checkpoint materializado y fuente. Mantener cloud **OFF**. Las pruebas físicas de C35 siguen pendientes.

