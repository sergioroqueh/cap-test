# R34 — Preparación práctica de sincronización (18/11/2026)

**Ámbito:** `sergioroqueh/cap-test`, rama `feat/cap-commercial`, PR #21 DRAFT. `cloudConfigured=false`. Sin Supabase SQL, API real, merge, despliegue, costes, scoring, banco ni cambios de UI.

## Estado verificado al inicio
- GitHub: HEAD `786cff1c84b54b44591b156c88d72a30511a7a28`, base main `d979ecac504f2099b885a2d2a371c070ef4fb808`; 265 commits ahead, 0 behind; PR #21 abierto DRAFT, Actions R33 consultadas con SUCCESS.
- Vercel: equipo `CuadernoTecnico TEAM`, plan Hobby. `cuadernotecnico` y `cap-test-pruebas` comparten equipo; Vercel Authentication (SSO) habilitada y último despliegue histórico READY. El lector `get_project` no expone `commandForIgnoringBuildStep`: el PATCH previo de `exit 0` **no está verificado con lectura API**. Confirmar manualmente en **Settings > Build and Deployment > Ignored Build Step**. Ningún despliegue nuevo.

## Hallazgos de revisión SQL C28/C29 (borradores NO aplicados)
1. C28 conserva progreso JSONB y sesiones completas; C29 añade eventos append-only. Ambas usan RLS y ownership por `auth.uid() = user_id`, `is_anonymous=false` y grants a `authenticated`. A/B con PostgreSQL desechable no equivale a A/B con JWT reales.
2. El UPDATE de `rc_question_progress.payload` debe limitarse a vista derivada del journal; no puede ser autoridad de intentos bajo concurrencia. Ni timestamp del cliente ni orden Lamport certifican orden físico o resultado oficial.
3. C29 comprueba solo parte del esquema: faltan validación profunda del payload, límites numéricos completos, procedencia de baseline, cuotas y comparación semántica cuando un `event_id` ya existe. Una PK que rechaza duplicados no demuestra que un reintento tiene contenido idéntico.
4. **Problema arquitectónico:** múltiples consultas PostgREST paginadas a eventos/sesiones no crean una única instantánea transaccional; una escritura concurrente puede producir cortes inconsistentes. Ningún endpoint materializado con snapshot estable ha sido implementado. No conectar el motor C29 hasta disponer de servicio transaccional autorizado.
5. C24: los dos WARN corresponden a **una función**, `public.rls_auto_enable()` (`SECURITY DEFINER`) con EXECUTE accesible a `anon` y `authenticated`. No se ha ejecutado la revocación: requiere autorización explícita.

## Código incorporado (inactivo)
- `src/remoteSnapshotReader.mjs`: lector **exclusivamente GET**, `enabled=false` por defecto y sin imports en app. Contrato previsto `/sync/v1/snapshot`; servidor futuro debe comprobar JWT + propietario/RLS, materializar un snapshot consistente entre **ambas tablas**, mantener cursor y TTL. Cliente revalida identidad y consentimiento por página, exige access token fresco, aborta por revocación, valida propietario, snapshot ID, límites, conteos, cursores, colisiones y baselines. No existe servicio remoto desplegado que implemente el protocolo.
- `src/cloudUploadPreflight.ts`: inspección local **de solo lectura** del backup v3 ya validado. Comprueba que el propietario sea el usuario verificado y se mantenga estable; contabiliza eventos/sesiones y detecta progreso histórico sin diario. Si existe, indica `manual-baseline-required`; **no inventa respuestas, no sube ni modifica datos**. Un checksum SHA-256 de backup no acredita identidad.
- `scripts/test_remote_snapshot_r34.mjs`: integración HTTP real **únicamente en loopback Node**, A/B, paginación, cuenta cruzada, lectura incompleta, consentimiento revocado y cloud apagada. Es prueba del contrato del cliente, **no prueba de RLS Supabase real**.
- Workflow `r34-snapshot-contract.yml`: Node 22, prueba HTTP local, `npm ci && npm run build` y aserción de que la interfaz no importa los módulos nuevos. Solo se ejecuta si cambian los archivos relevantes. No escribir ni desplegar.

## Puertas siguientes, no autorizadas en R34
- Verificar Ignored Build Step de Vercel manualmente.
- Cerrar C24 y revisar/migrar SQL únicamente bajo permiso expreso.
- Construir backend transaccional que verifique JWT y RLS; diseñar append idempotente con comparación de contenido, quotas, cursores y snapshots consistentes.
- Integración local que no pierda legado y consentimiento explícito revocable (el módulo R34 no se conecta a la UI).
- Ensayos A/B/JWT reales tras aprobar una migración dev; recuperación v3, conflictos, dispositivos físicos; licencias y CLM antes de beta.
- Mantener PR #21 DRAFT, `main` intacta y `cloudConfigured=false`.
