# C31 — Recuperación local completa y separación de perfiles (17/11/2026)

**Rama de trabajo:** `feat/cap-commercial`, PR #21 DRAFT. Prohibido migrar SQL, activar sincronización cloud, tocar Supabase real, modificar el scoring, publicar o fusionar hasta revisión específica. `cloudConfigured=false`.

## Contrato de copia

`exportDatabase()` preserva la API, pero delega a `exportFullBackup()`. El formato sigue siendo **v3** para mantener compatibilidad; ahora contiene `version`, `exportedAt`, `owner` (`guest`, `preview` o `userId` verificado previamente en la aplicación), `progress`, `sessions` con `clientId` estable y respuestas completas, `journal` y `checksum` SHA-256 de contenido canónico. La instantánea de progreso, sesiones y diario se lee en **una misma transacción IndexedDB de solo lectura**. Se completa antes la asignación idempotente de claves de sesiones antiguas. El hash sirve para detectar corrupción accidental y alteración simple del archivo: **no es una firma criptográfica de identidad ni autenticación de cuenta**.

No se exporta el identificador numérico local de sesión (es propio del navegador). En la restauración se asigna el nuevo número autoincremental sin cambiar `clientId` ni `answers`.

## Recuperación e idempotencia

`restoreFullBackup()` rechaza cualquier formato distinto de v2/v3, registros mal formados o demasiado grandes, claves de eventos o sesiones colisionantes, agregados que no coinciden con su propio journal, múltiples baselines ambiguos, y copias con checksum incorrecto. El propietario de v3 etiquetada debe coincidir con el perfil local actual. Las copias históricas v2 o v3 **sin metadatos de propietario** solamente se recuperan en un perfil **invitado/preview vacío**. No se permite importarlas en cuentas verificadas, ni fusionarlas después con un invitado que ya tenga datos. Las sesiones v2 sin `clientId` requieren el ID numérico original y reciben una clave derivada de SHA-256 determinista; si falta esa procedencia se rechazan.

En una copia v3 del mismo propietario se fusionan eventos append-only por `eventId`, sesiones por `clientId`, y progreso derivado por `replayProgress()`. Los agregados antiguos sin diario no se suman, ni se mezclan con conjuntos de eventos desconocidos. Si difieren, se rechaza el archivo, conservando el perfil tal cual. La fusión utiliza **una transacción de lectura-escritura** sobre `progress`, `sessions`, `progressEvents` y `syncMeta`; no borra datos antes de importar. Se reconstituyen referencias `origin:<questionId>`, el reloj lógico pasa al mayor evento conocido y el nuevo navegador conserva **su propio `deviceId`**, sin hacerse pasar por el dispositivo original.

`localOwnerGeneration()` detecta cambios de sesión durante cálculo/verificación y cancela antes del commit. La aplicación pide confirmación, indica conflictos y muestra el balance final. C31 no guarda contraseñas, JWT ni certificados en los backups.

## Pruebas y limitaciones

Workflow `.github/workflows/c31-backup-recovery.yml` con TypeScript, compilación y Chromium real. `scripts/e2e_backup_recovery_c31.mjs`: exportación completa, borrado→restauración, reimportación idempotente, continuación con nuevas respuestas, separación A/B/invitado, checksum corrupto, colisión de sesión, rollback, compatibilidad v2 y v3 sin propietario, restauración concurrente con otra pestaña, cancelación por cambio de perfil y **cero accesos a Supabase**. C30 sigue probando escrituras simultáneas en dos pestañas.

## Contrato remoto aislado (NO conectado)

`src/remoteSyncContract.mjs` define una licencia de sincronización **desactivada por defecto**; exige proveedor de identidad verificada y consentimiento explícito antes de cada operación, fija `userId`, vuelve a verificar tras cada espera de red y aborta con `AbortController` cuando se revoca por logout/cambio de cuenta. `scripts/test_remote_sync_contract_c31.mjs` prueba cancelación, invitado, identidad errónea y la ausencia total de peticiones cuando la puerta está cerrada. No se importa desde la aplicación ni implementa un transporte; no sustituye RLS servidor.

**Pendiente para nube:** el archivo no constituye prueba criptográfica del propietario; el servidor deberá validar identidad con JWT en cada solicitud. Todavía no existe PostgREST adapter, consentimiento explícito, cancelación robusta en/logout o recuperación entre dispositivos vía nube. Antes de habilitar esa fase harán falta políticas RLS reales aprobadas, casos de JWT expirado/rotado, ataques de replay, paginación, cuotas, protección ante múltiples dispositivos y red fallida. R32 frecuencia congelada **2/2/1 frente a 3/3/3** sigue abierto y no debe ocultarse.
