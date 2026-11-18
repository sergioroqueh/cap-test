# C38 — Integridad materializada bajo escrituras concurrentes (18/11/2026)

**Estado:** CI [#44264628053](https://github.com/sergioroqueh/cap-test/actions/runs/44264628053) SUCCESS, **27/27 aserciones PASS** en PostgreSQL 17 efímero, conexiones independientes. La primera ejecución [#44264435700](https://github.com/sergioroqueh/cap-test/actions/runs/44264435700) falló al insertar un evento sintético por parámetros JSON sin casteo explícito; se corrigió el script y se repitió por completo. Sin acceso a Supabase real ni activación de cloud.

## Implementación exclusivamente desechable

- `docs/commercial/sql/C38_snapshot_integrity_fixture.sql`: extiende C37 con tabla de integridad (usuario, snapshot, total de filas, bytes, digest, finalización). El `begin` comprueba los **datos realmente materializados**, no solo el preflight de origen; si se supera el límite, toda la transacción aborta.
- Las páginas entregan `checkpoint`, `rowCount`, `byteCount` y `digest` constantes para cada snapshot. El digest se recalcula y comprueba contra las filas retenidas antes de responder. `finish` exige digest y número de filas idénticos y es idempotente.
- `scripts/test_snapshot_integrity_c38.py`: simula una escritura concurrente mientras una función trigger temporal bloquea la inserción del manifiesto **después** del preflight y **antes** del SELECT que materializa las filas. Así se verifica la carrera de fuente que C37 no cubría.
- `.github/workflows/c38-snapshot-integrity.yml`: CI de PostgreSQL temporal con la cadena C15/C28/C29/C34/C35/C37/C38.

## Evidencia de las 27 aserciones

1. Creación y totales realmente materializados; digest compartido entre páginas y streams y cursores ordinales correctos.
2. `finish` rechaza digest o recuento incorrecto, acepta el correcto y responde `already_finished` en reintento; `begin` es idempotente y rechaza checkpoint divergente.
3. Origen posterior no cambia digest antiguo; nueva creación sobre cuota falla; roles web no leen tabla privada ni invocan `finish`.
4. Expiración bloquea `finish`; cleanup borra metadatos mediante FK cascade.
5. **Concurrencia forzada**: trigger retrasa inserción, otro proceso añade respuesta mientras el primer creador está bloqueado (`PgSleep` observado en `pg_stat_activity`). Se produce `C38_MATERIALIZED_ROW_QUOTA`; no quedan manifiesto, digest ni páginas parciales.
6. Rollback de creación completa; cuenta B separada, rechazo de finalización cruzada y aislamiento RR todavía prohibido.
7. `cloudConfigured=false` confirmado por GitHub Actions.

## Interpretación y limitaciones

La política synthetic `2 snapshots / 3 filas / 2048 bytes` sigue sin representar capacidades de producto. El digest utiliza `md5` de JSONB ordenado para **detectar variaciones accidentales en fixtures**, no autenticación criptográfica ni formato final de respaldo. La consistencia se verifica sobre una materialización de filas en un SELECT; no se ha demostrado un protocolo end-to-end con tráfico HTTP, checkpoint firmado, rotación, hashes SHA-256 canónicos interplataforma, verificación de JWT en gateway, sincronización tras fallo de red ni rehidratación de cliente en dispositivos físicos. La función es backend-only con parámetros simulados; **NO ES UNA RPC PUBLICADA**.

## Próxima puerta técnica C39

Analizar transferencias paginadas completas con hash/recorrido serializado canónico, manifest firmado/autenticado o vinculado al servidor, comprobaciones de filas faltantes/repetidas y orden alterado; simular fallos de red, reanudación e idempotencia cross-device en lector HTTP mock-only. Mantener toda ejecución sobre datos sintéticos; ninguna migración, nube, despliegue, merge, pagos ni scoring. R32 2/2/1 versus 3/3/3 permanece abierto y separado.
