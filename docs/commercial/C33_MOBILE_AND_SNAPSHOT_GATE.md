# C33 — Copias desde la interfaz y protocolo de snapshot aislado (17/11/2026)

**Ámbito autorizado:** rama `feat/cap-commercial`, PR #21 DRAFT. `main` sin tocar. `cloudConfigured=false`. Ningún SQL aplicado ni cambios en Supabase real, scoring, pagos, despliegues o producción.

## Diagnóstico previo
La validación CAP del HEAD C32 falló exclusivamente en `Verify staged R32 evidence (no scoring changes)`. El ledger de frecuencias **2/2/1 frente a 3/3/3** sigue congelado; no se modifica ni silencia. C32 específica pasó con Chromium, Node y PostgreSQL desechable.

## Interfaz de backups
- `src/BackupPanel.tsx` + `src/backupPanel.css` sustituyen las alertas/confirmaciones nativas de importar por un flujo **seleccionar → inspeccionar → confirmar/cancelar**, con estado accesible y alertas inline. Ocupa la misma sección del perfil, sin convertirla en protagonista de la aplicación.
- `inspectFullBackup()` en `src/backupRecovery.ts` comprueba la estructura, propietario, SHA-256 y coherencia del journal **sin modificar IndexedDB**; `restoreFullBackup()` repite todas las validaciones durante la restauración atómica.
- Exportación protegida contra cambio de perfil y mensajes claros; enlace de descarga temporal revocado con retraso para compatibilidad móvil. Archivo JSON limitado a **50 MB** antes de analizarse. Botones de al menos **48 px** y columnas adaptables a pantallas estrechas; el botón de carga usa selector accesible desde teclado.
- La UI no promete que estén incluidos los exámenes en curso o preferencias: la copia solo contiene progreso, eventos y sesiones **terminadas**. No presenta SHA-256 como autenticación ni ofrece mezcla automática entre cuentas.
- El cambio de perfil tras seleccionar una copia invalida la confirmación. El componente protege contra actualizaciones de estado tras desmontarse. No representa una garantía contra manipulaciones maliciosas del navegador: la autoridad real siempre será JWT/RLS en servidor antes de sincronización.

`scripts/e2e_backup_ui_c33.mjs` comprueba la interfaz real en Chromium, con móvil simulado **375 × 812** y escritorio **1280 × 800**: acceso invitado, descarga real, selección/preview, cancelar sin escrituras, restauración, reimportación idempotente, JSON roto, hash alterado, cambio de perfil durante la confirmación, copia manual entre navegadores, ausencia de overflow horizontal y **cero peticiones Supabase**. No se conectan identidades Google reales en CI.

## Coherencia de paginación: prototipo, no servidor
`src/snapshotCursorDraft.mjs` es una especificación ejecutable sin `fetch`, sin llamadas a PostgREST ni importación desde la aplicación. Pide a un **proveedor simulado** `begin()` (manifiesto con ID y checkpoint de instantánea), `page()` (filas ordenadas de esa instantánea, clave, propietario, cuenta y rango) y `finish()` (confirmación de mismo checkpoint). Cada operación pasa por el contrato de identidad y cancelación de C31. Rechaza faltantes, duplicados, rangos inconsistentes, cambios de propietario/instantánea, sesiones o eventos mal formados.

`scripts/test_snapshot_cursor_c33.mjs` prueba escrituras concurrentes de la base simulada durante el recorrido de páginas, reemplazos con **idéntico número de filas**, cambio de checkpoint, duplicados, rango parcial, cuenta cambiada, logout y límites. Se valida que el consumidor solo acepte datos proporcionados como una instantánea coherente cuando el proveedor **cumple** el contrato.

**Importante:** la implementación real de `begin/page/finish` NO EXISTE en Supabase. La consulta `Range` de C32 no obtiene por sí sola un snapshot transaccional, y un checkpoint declarado sin garantías de aislamiento del servidor tampoco sirve. Antes de nube debe revisarse una RPC/backend que materialice una instantánea consistente o un protocolo append-only con watermark seguro por propietario y tabla, sus límites y expiración; RLS y JWT A/B deben probarse con autorizaciones explícitas y datos reales de prueba. La prueba C33 no demuestra esa propiedad en PostgREST actual.

## Puertas antes de producción
Sin autorización separada para migraciones C28/C29, unión de cuentas, subida de historial, conexión cloud real, habilitación de pagos ni merge/deploy. Requiere además pruebas de navegador móvil real, accesibilidad manual, control de tamaño de copias grandes, errores de cuotas reales y manejo de sesiones iniciadas antes de logout.
