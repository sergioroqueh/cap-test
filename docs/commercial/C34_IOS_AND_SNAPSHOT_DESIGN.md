# C34 — Teclado, WebKit móvil y diseño de instantánea de servidor

**Fecha de trabajo:** 18/11/2026 (continuidad C34 del 17/11). Rama `feat/cap-commercial`, PR #21 DRAFT. `main` intacta. Sin migraciones reales, conexiones de sincronización, despliegue, pagos ni cambios de scoring. `cloudConfigured=false`.

## CI heredada
C7 finalizó **SUCCESS** en la última ejecución de C33, al igual que C15/C28–C33, R26, R30 y R31. La validación general CAP falló en la evidencia R32 congelada, todavía **2/2/1 frente a 3/3/3**. No se silencia ni se altera el examen o la puntuación.

## Accesibilidad y recuperación local
- `BackupPanel`: al seleccionar una copia válida, el foco se sitúa en «Antes de restaurar» (título con `tabIndex=-1`); Escape cancela **sin escribir**, devuelve el foco a «Seleccionar copia» y limpia el archivo. La confirmación funciona con Enter, los avisos mantienen `role=status/alert`, y la sección anuncia `aria-busy`. El listado de contenidos lleva `role=group`; estados de lectura y restauración son anunciables. Los botones mantienen objetivo táctil de 48 px y estilos `:focus-visible`.
- `localScope.ts` notifica de forma **sincrónica** un cambio de propietario. El panel borra la previsualización, el archivo preparado para compartir y los avisos aunque el componente React siga montado. Los cálculos de exportación verifican generación; ya no pueden descargar una copia de la cuenta anterior después del cambio.
- `backupRecovery.ts` se suscribe al cambio de propietario mientras su transacción IndexedDB sigue abierta; aborta la transacción antes de confirmar si se produce un logout o cambio de cuenta. Si el commit terminó previamente, no afirma falsamente que se haya deshecho. **Una transacción confirmada no puede revertirse**: se cancela únicamente la que aún esté activa.
- Compatible con el flujo de C33: el test de regresión se actualiza para comprobar que desaparece inmediatamente «Confirmar restauración» al cambiar de cuenta, en lugar de esperar a pulsarlo y ver un error.

## Descarga en iOS: compatibilidad sin prometer Safari físico
- Se mantiene la descarga clásica `Blob`/enlace `download`, con revocación diferida de URL.
- Si `navigator.share` y `navigator.canShare({files})` existen, se presenta una **segunda acción optativa** «Compartir archivo». La función `navigator.share` se invoca directamente en el gesto de ese botón (necesario para políticas de activación de Safari); el usuario elige expresamente «Guardar en Archivos» o cualquier otra app. RutaCAP **no comparte datos automáticamente**.
- La prueba C34 usa Chromium + **WebKit de Playwright en Linux con viewport de móvil emulado**. Puede detectar errores de interfaz/capacidades WebKit pero **no es equivalente a Safari instalado en un iPhone real**, ni demuestra el flujo nativo de «Archivos» en iOS. Antes de lanzamiento hace falta prueba física manual con Safari, PWA instalada, permisos de archivos, interrupciones y descargas mayores.

## Modelo de snapshot de servidor: solo fixture PostgreSQL
Se propone un enfoque de **materialización inmutable por propietario, snapshotId y TTL**: una transacción servidor `REPEATABLE READ` copia eventos y sesiones a tablas de filas ordenadas, asigna un checkpoint fijo y registra vencimiento. Las páginas leen **solo** esas filas materializadas, no las tablas vivas. El protocolo `begin/page/finish` de C33 exige propietario verificado, snapshotId+checkpoint inalterables, rango ordenado y confirmación final. La expiración invalida páginas. Las tablas de snapshots **no conceden a clientes permisos de INSERT/UPDATE/DELETE**. RLS impide a B leer el snapshot de A, a tokens anónimos leer cualquier dato y a quienes no incluyan `is_anonymous=false` recibir filas.

`docs/commercial/sql/C34_snapshot_materialization_fixture.sql` crea **solo dentro de PostgreSQL desechable de CI** las tablas de prueba y comprueba: cambios en tablas de origen posteriores a crear la instantánea no alteran los resultados; respuestas completas preservadas; ordenación; acceso A/B; anónimo; rol anon; denegación de escrituras y TTL. **No se trata de migración lista para producción**: el SQL es una prueba de concepto, no crea RPC ni aplica tablas a Supabase, ni define todavía cuota, retención, limpieza, antifraude, materialización incremental, costes ni atomicidad con fuentes futuras. El backend real deberá diseñarse, revisar políticas de RLS y permisos y aprobarse en otra ronda. Una snapshot `REPEATABLE READ` aislada es una propiedad del servidor, no algo que pueda demostrar por sí solo un cliente PostgREST con páginas independientes.

## Puertas de lanzamiento
La autorización continúa limitada al desarrollo local y tests sintéticos. Mantener `cloudConfigured=false`, PR #21 DRAFT y `main` sin cambios. Se necesita revisión y aprobación separada de cualquier SQL/migración real y conectividad de nube, además de pruebas físicas iOS/Android y de límites de archivos, accesibilidad manual con VoiceOver/TalkBack y R32 resuelta de forma editorial.
