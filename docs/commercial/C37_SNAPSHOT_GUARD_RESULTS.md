# C37 — Guard de aislamiento y paginación contra cleanup (18/11/2026)

## Estado y límites

**23/23 aserciones PASS en PostgreSQL 17 desechable**, GitHub Actions [#44263493819](https://github.com/sergioroqueh/cap-test/actions/runs/44263493819), job `disposable-only`. Rama `feat/cap-commercial`, PR #21 DRAFT. `main`, Supabase real, despliegue, scoring y pagos intactos. `cloudConfigured=false`.

## Qué se implementó

- `docs/commercial/sql/C37_snapshot_guard_fixture.sql`: sobrescribe **solo en PostgreSQL desechable** la función C35 para rechazar `REPEATABLE READ` y `SERIALIZABLE` (`C37_ISOLATION_REQUIRED`) antes de adquirir lock y comprobar cuota. `READ COMMITTED` mantiene el advisory lock por usuario.
- Añade lectura backend-only `rc_c37_fixture_page` con cursor `stream + ordinal`, límite sintético 1–50, checkpoint y comprobación de caducidad real `clock_timestamp()`. Revocados permisos de ejecución a roles web. No equivale a endpoint HTTP ni a firma JWT validada.
- `scripts/test_snapshot_concurrency_c37.py`: sesiones PostgreSQL independientes con concurrencia controlada, rollback, crecimiento del origen, páginas interrumpidas por expiración/cleanup, bloqueo, timeout y RLS sintético.
- `.github/workflows/c37-snapshot-guard.yml`: GitHub Actions con PostgreSQL 17 efímero; cadena C15/C28/C29/C34/C35/C37; CI comprueba `cloudConfigured=false`.

## Evidencia exacta

1. RR y SERIALIZABLE rechazados; sin manifiesto residual.
2. Dos creaciones concurrentes para A con una plaza disponible en RC: `created` + `ACTIVE_QUOTA`; total 2/2 y sin filas parciales de la rechazada.
3. Rollback elimina filas materializadas y manifiesto por atomicidad de transacción.
4. Cambios en eventos fuente posteriores a snapshot no modifican páginas materializadas; exceso de filas rechaza nuevo snapshot sin parcial.
5. Lector obtiene primera página, mantenimiento de otra conexión expira y limpia, segunda página en **la misma transacción RC abierta** recibe `SNAPSHOT_EXPIRED`. Validado que el reloj de transacción está congelado respecto a `clock_timestamp()`.
6. Cascada sin huérfanos y posterior solicitud rechazada.
7. Timeout de lock mismo propietario, otro propietario opera sin bloqueo; sin manifiestos parciales.
8. Rol `authenticated` con JWT sintético B no ve páginas A ni puede invocar función backend; stream inválido y page size excesivo rechazados.

## Interpretación

C36 reprodujo un defecto real de la combinación RR + advisory lock + conteo por MVCC. C37 impide **ese intercalado concreto** en el fixture e implementa lecturas expuestas a TTL que fallan cerradas. **No está validada una solución cloud final**. Las pruebas sintetizan claims JWT mediante `set_config`; no verifican firma/claims del gateway. La interfaz de lectura es una función privada de prueba, no API desplegable.

## Pendiente de puerta cloud

- Consistencia de origen: una sola generación/checkpoint coherente bajo escrituras concurrentes; fijación de recuentos y checksum entre begin/page/finish.
- Lecturas reales HTTP, suspensión y reanudación, pérdida de conexión, reintentos después de commit incierto, archivo de gran tamaño, límites/rate-limit reales, auditoría y consentimiento.
- Pruebas de integridad bajo múltiples lectores, simulación de parada/reinicio del backend y cancelación a mitad de stream.
- iPhone Safari/PWA, Android y accesibilidad física de C35 siguen SIN EJECUTAR.
- Validate CAP mantiene incidencia editorial R32 2/2/1 frente a 3/3/3, ajena a scoring cloud.
- No activar migraciones, cloud, merge, deploy ni pagos sin autorización explícita.
