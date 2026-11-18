# C39 — Transferencia completa SHA-256 y reanudación mock-only (18/11/2026)

**Estado de evidencia:** workflow [#44266810893](https://github.com/sergioroqueh/cap-test/actions/runs/44266810893), 10/10 C39 y 7/7 regresiones C33 PASS. El commit documental posterior dispara un nuevo run que deberá comprobarse por separado.

## Aislamiento estricto

La implementación está únicamente en `scripts/c39_snapshot_transfer.mjs` y `scripts/test_snapshot_transfer_c39.mjs`; **no se incorpora a la interfaz ni utiliza HTTP, Supabase, URL o credenciales externas**. `fixtureOnly:true` es una marca explícita de proveedor de pruebas, no una frontera de confianza de producto. `cloudConfigured=false`. PR #21 DRAFT.

## Contrato probado

- Emisor sintético fija `ownerId`, `snapshotId`, `checkpoint`, conteos por stream y digest SHA-256 de filas ordenadas, incluyendo stream/ordinal y contenido.
- Serialización JSON recursiva con claves de objeto en orden léxico, codificación UTF-8 y huella SHA-256. **Es una convención interna del fixture**, no un esquema normalizado de interoperabilidad ni una firma del servidor.
- Lector solicita páginas consecutivas para `events` y `sessions`. Rechaza páginas ausentes, repetidas, desordenadas, con propietario/identidad/checkpoint/hash diferente y filas con claves inmutables duplicadas.
- Ante corte de red simulado, entrega un objeto `resume` con identidad de generación y filas recibidas. La siguiente invocación revalida identidad y, tras completar todas las páginas, verifica el digest entero antes de aceptar `finish`.
- Se rechaza reanudación sobre otra generación y se verifica rechazo de `finish` sin confirmación o con digest distinto.

## Resultados CI

10 escenarios nuevos, 7 regresiones C33 y verificación de `cloudConfigured=false`, todos PASS en ejecución #44266810893.

## Limitaciones antes de servicio real

- El digest del manifiesto se considera fiable **solo dentro del fixture**; no autentica por sí mismo a un servidor. Se precisa vincular propietario, expiración, identidad y manifiesto al JWT comprobado en gateway, o una firma/MAC adecuada en el backend.
- El objeto de reanudación reside **en memoria**, no en almacenamiento durable; falta persistencia transaccional, límites de tamaño, cuotas, cifrado/privacidad local y recuperación tras cierre de proceso.
- No hay transporte HTTP auténtico, latencia real, cortes de conexión del navegador, paginación SQL/HTTP combinada ni lectura de recursos en producción.
- Falta especificar el formato de serialización interoperable (p. ej., interoperabilidad SHA-256 entre JS y PostgreSQL sobre un esquema versionado). La huella MD5 de C38 sigue siendo independiente y **no se ha afirmado que coincida** con SHA-256 C39.
- No se ha efectuado una restauración real en IndexedDB desde esta transferencia. No se ha implementado un criterio de `finish` ligado al commit local real ni control de logout durante esta capa nueva (eso se cubre parcialmente en C33/C34).
- No hay pruebas físicas iOS/Android de C35; la discrepancia editorial R32 2/2/1 vs 3/3/3 sigue abierta, sin tocar scoring.

**Próximo objetivo C40:** contrato de manifiesto versionado y autenticación mock firmada, persistencia transaccional y recuperación del journal de páginas, simular logout y cambio de propietario durante reanudación; conectar solo con almacén sintético, nunca activar cloud.
