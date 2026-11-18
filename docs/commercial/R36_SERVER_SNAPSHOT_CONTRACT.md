# R36 — contrato de servidor para snapshots de lectura (18/11/2026)

## Motivo y alcance
Después de R35, el usuario verificó en su Windows el comando
`node scripts/e2e_local_sync_adapter_r35.mjs`: **R35 PASS**, IndexedDB real y cero peticiones cloud.
No se usa esa prueba como evidencia de A/B real con JWT/RLS de Supabase.

**R36 no es un backend de producción.** `src/serverSnapshotProtocol.mjs` prepara
la mitad servidor de `src/remoteSnapshotReader.mjs` de R34, en memoria y sin conectar
a Vercel, Supabase ni a la app. No incluye escritura, tablas, pago, permisos
comerciales ni importación de datos de estudio.

## Contrato de lectura
`createServerSnapshotProtocol({verifyAccessToken,takeConsistentSnapshot,...})` expone
`handle(Request): Promise<Response>`, sin escuchar puertos ni usar claves.
La ruta GET `/sync/v1/snapshot` acepta `resource=events|sessions`,
`limit`, `snapshotId` y `cursor`.

- Identidad: `verifyAccessToken` es una dependencia **del servidor** que, al
  implementarse, debe verificar el JWT con Supabase Auth y el consentimiento
  persistido. Se invoca en **cada página**, no se acepta `userId` enviado por cliente.
  No se permiten cuentas invitadas ni anónimas.
- Al comenzar un snapshot, `takeConsistentSnapshot(userId)` **debe** leer ambas
  tablas en **una transacción coherente**, bajo un propietario verificado y RLS.
  **Este módulo no implementa ni certifica ese requisito**: lo exige al futuro adaptador PostgreSQL.
- Los datos materializados son copias estructuradas, con validación por C29,
  id aleatorio, propietario ligado a sesión, TTL, límite de snapshots concurrentes
  y respuesta `no-store`. Si caduca, el cliente debe reiniciar la lectura.
- La autorización se comprueba también al leer un snapshot materializado.
  Un usuario B no puede paginar un snapshot de A; no se revela su existencia.
- `totalRows`, `done` y `nextCursor` mantienen la invariancia exigida por R34.
  Se limita el tamaño de página antes de serializar.
- Solo lectura: no hay `POST`, transacción de escritura, administración ni cliente
  `service_role`. La futura escritura idempotente con conflicto semántico es otra fase.

## Verificación focalizada
`scripts/test_server_snapshot_r36.mjs` conecta mediante **HTTP de Node real**
el lector R34 con el nuevo protocolo R36. Comprueba:

- dos recursos leídos de una única versión inmutable a pesar de que el origen
  añade un evento entre páginas;
- un segundo snapshot que sí recoge el evento nuevo;
- aislamiento A/B, rechazo de solicitudes sin credenciales, revocación de
  consentimiento, consulta malformada y caducidad por TTL;
- ausencia de Supabase, SQL y despliegues.

El test inyecta un verificador de tokens de **ensayo** y un almacén en memoria
con copia atómica. **Nunca se debe desplegar ese verificador ni presentar este
ensayo como validación de JWT o RLS reales.**

## Puertas de aprobación pendientes
1. Aprobar en una fase independiente la migración C28/C29 adaptada y la
   corrección del advisor C24 sobre `public.rls_auto_enable()`.
2. Construir un adaptador PostgreSQL que preserve la transacción entre ambos
   recursos: cuentas A/B reales, JWT caducado/revocado, lectura bajo RLS
   (no secret/service_role), revisión de permisos mínimos.
3. Diseñar escritura idempotente real y conflictos, límites, paginación
   transaccional, retención/datos personales y garantías de disponibilidad.
4. Obtener aprobación **separada** para activar cloud, desplegar, pagos o merge.

Se mantienen `cloudConfigured=false`, `feat/cap-commercial`, PR #21 DRAFT,
`main` intacta, y Vercel `Ignored Build Step: Don't build anything / exit 0`.

Referencias revisadas: `docs/commercial/C51_PRODUCTION_ARCHITECTURE_DECISION.md`,
`src/remoteSnapshotReader.mjs`, `src/syncCore.mjs`,
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
