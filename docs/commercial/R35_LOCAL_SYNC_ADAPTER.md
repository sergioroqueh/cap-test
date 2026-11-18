# R35 — puente IndexedDB seguro, sin nube (18/11/2026)

## Hecho verificable del usuario
- Vite 8.3.8 en `localhost:5173` con RutaCAP comercial visible.
- Inicio/cierre/reinicio Google OAuth local funcionando. Intento de inicio de sesión con otra cuenta rechazado. **Esto no es una prueba de RLS entre dos cuentas registradas, ni de sincronización cloud.**
- Ignored Build Step de Vercel confirmado visualmente como `Don't build anything` / `exit 0`. R34 produjo intento CANCELED y ningún nuevo READY.
- Al inicio de R35, HEAD GitHub `96995093ee8762b4c4ba52e292701e5411b448c2`, PR #21 DRAFT, main intacta, CI R34 SUCCESS.

## Qué aporta R35
Se prepara `src/localSyncAdapter.ts`, sin importaciones desde App ni llamadas de red. Implementa las operaciones `ensureSessionIds`, `snapshot` y `merge` exigidas por `syncOfflineFirst()` de C29. **No se conecta ese motor ni se autoriza una llamada a Supabase.**

- Bloqueado por defecto: `enabled=false`. Requiere UUID de propietario, identidad revalidada, consentimiento explícito y la misma generación de perfil. Invitado y preview rechazados.
- Lee eventos y sesiones completos del backup local v3 mediante transacción de solo lectura; nunca consulta solo últimas 20 sesiones.
- Rechaza agregados históricos sin journal: necesitan baseline explícito, no se inventan respuestas ni contadores.
- Los datos entrantes se validan mediante `unionRecords` y `replayProgress`; las claves numéricas de IndexedDB de otro dispositivo se rechazan.
- Fusiona los eventos/sesiones por la **misma ruta de restauración C31**, que ya utiliza transacciones IndexedDB, checksums de corrupción, validación de propietario, colisiones e idempotencia. No implementa una segunda lógica transaccional independiente.
- Verifica de nuevo consentimiento y generación de perfil después de operaciones asíncronas. Una revocación previa al commit aborta vía la protección C31.
- `getVerifiedIdentity` será inyectado posteriormente por un coordinador con Supabase Auth real, y solo después de autorizar backend transaccional y RLS. No confiar en el cliente para autorizar el servidor.

## Verificación focalizada
`scripts/e2e_local_sync_adapter_r35.mjs`: Chromium + IndexedDB reales, cuentas UUID de prueba independientes A/B, lectura local, fusión de dos operaciones y dos sesiones, reintento idempotente, rollback en colisión, consentimiento retirado, cambio de propietario, bloqueo de agregado legado sin diario, y detección de cualquier solicitud Supabase. El ensayo utiliza perfiles sintéticos **solo en el navegador**, sin estructuras de autoridad C41–C50.

Workflow `.github/workflows/r35-local-sync-adapter.yml` limitado a los archivos relevantes: Node 22, `npm ci`, build, Playwright Chromium y gate `cloudConfigured=false`; ninguno de sus pasos tiene autorización de deploy o conexión de datos cloud.

## Qué sigue pendiente
- RLS C28/C29 es diseño SQL no aplicado. A/B real y JWT expirada, sincronización remota y semántica, consentimiento UI, servidor de snapshots transaccional y escritura idempotente con comparación de contenido necesitan fases autorizadas.
- La copia v3 protege contra corrupción, no acredita criptográficamente propietario. El adaptador no suple comprobaciones de autorización del servidor.
- Dos WARN del asesor de seguridad sobre una única función `public.rls_auto_enable()`, todavía sin revocar.
- Licencias CLM/exámenes y pruebas en móviles físicos siguen pendientes.
- Mantener PR #21 DRAFT, main intacta, cloud OFF, sin SQL real, sin despliegues y sin compras.

## Comprobación doméstica opcional
En PowerShell, fuera del terminal donde Vite está sirviendo:

```powershell
Set-Location 'D:\Programacion\RutaCAP\cap-test-r34'
git fetch origin feat/cap-commercial
git pull --ff-only origin feat/cap-commercial
npm ci --no-fund --no-audit
npm run build
node scripts/e2e_local_sync_adapter_r35.mjs
```
Para ejecutar el último comando debe seguir abierto Vite en `http://localhost:5173` y Playwright Chromium instalado con `npx playwright install chromium`. La prueba usa perfiles locales falsos con identificadores UUID reservados en el test; nunca manipula la cuenta real.
