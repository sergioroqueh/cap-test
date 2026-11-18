# C43 — Política de confianza pública, rotación y protección antirrepetición (18/11/2026)

**Estado funcional verificado:** [GitHub Actions #44276967486](https://github.com/sergioroqueh/cap-test/actions/runs/44276967486) **SUCCESS** en `feat/cap-commercial` (PR #21 DRAFT). C43: **11/11 escenarios Chromium** y **11/11 WebKit Linux**; regresiones C42: 9/9 por navegador; C41: 9/9 por navegador. Total **58 subescenarios PASS** (64 nodos TAP incluyendo seis agrupadores). La guardia `cloudConfigured=false`, sin importaciones de C43 desde `src/`, sin endpoints remotos ni secreto privado en el módulo browser terminó en PASS. No se tocó `main`, Supabase real, migraciones, deploy, merge, pagos ni scoring.

## Implementación únicamente fixture

- `scripts/c43_public_trust.mjs`: módulo independiente para navegador sintético, sin importación desde la aplicación comercial; usa WebCrypto ECDSA P-256 SHA-256, claves públicas y IndexedDB `rutacap-c43-fixture-<namespace>` con `trust` y `grants`.
- `scripts/test_public_trust_c43.mjs`: arnés Playwright. Las claves privadas de raíz y firmantes se generan **solo dentro del proceso Node** de CI. El navegador recibe **únicamente** la JWK pública raíz de bootstrap, políticas firmadas, JWK públicas de firmantes y manifiestos sintéticos.
- `.github/workflows/c43-public-trust.yml`: CI Chromium y WebKit Linux en GitHub runner temporal, servidor de fixture ligado a `127.0.0.1`, rutas externas bloqueadas. Regresiones C42 y C41.

## Política de confianza anclada

El arnés fija una **raíz pública proporcionada en la inicialización separada de la política**: la política recibida no puede elegir ni reemplazar la raíz. Se comprueba firma ECDSA sobre una representación JSON determinista con separación de dominio `RUTACAP-C43-TRUST-P256-V1`. La política contiene `revision`, `epoch`, `issuer`, `audience`, fechas y conjunto de `kid` con JWK pública, validez y estado `active`, `retired` o `revoked`.

La revisión y época aceptadas se guardan en IndexedDB mediante `readwrite`. Se rechazan downgrade de revisión/época y políticas distintas con la misma revisión; la misma firma/documento puede reintentarse idempotentemente. Al leer una política almacenada se verifica **de nuevo su firma raíz**, además de comprobar su checksum sintético y caducidad. Un checksum local editable nunca se trata como prueba criptográfica de autoridad.

**Limitación central:** la raíz es inyectada por el propio harness de prueba. No existe raíz incorporada de producción, distribución autenticada ni política real de actualización/recuperación del dispositivo. No es un PKI ni un JWT gateway listo para desplegar.

## Manifiestos y replay

El emisor simulado firma concesiones v2 con separación de dominio `RUTACAP-C43-GRANT-P256-V2`: `kid`, `epoch`, `ownerId`, `sessionId`, `jti`, marcas de tiempo, issuer, audience y snapshot completo (ID, checkpoint, conteos, digest). La concesión se verifica con la clave pública de la **política actual**, no con una JWK proporcionada por el propio documento.

Se comprueban:
- `notBefore` / caducidad, duración máxima sintética y validez de clave sin elegir otra clave como fallback.
- Estado de clave: `revoked` invalida; `retired` permite en el fixture únicamente concesiones con `issuedAt` anterior a `retiredAt` y no expiradas. **Esto no impide que el tenedor de una clave retirada emita documentos retrodatados**: el modelo final necesitará decisiones explícitas de periodo de gracia y revocación dura.
- Rechazo de epoch obsoleta incluso si la firma criptográfica sigue siendo válida.
- Ledger transaccional `jti` en IndexedDB. La repetición de **exactamente la misma concesión firmada** para misma cuenta/sesión es idempotente; otro `sessionId`, generación, documento o huella bajo el mismo `jti` se rechaza con `REPLAY_REJECTED`.
- La transacción de concesión verifica que no haya cambiado la revisión/huella de la política durante la verificación asíncrona, antes del commit.

El ledger es un prototipo, sin limpieza/caducidad de entradas, límite de memoria global, anti-replay interoperable entre dispositivos ni autoridad remota. IndexedDB protege coherencia local, no es fuente global de autorización.

## Evidencia específica 11 × 2 motores

1. Política de raíz válida, concesión ECDSA y reintento idempotente.
2. Raíz sustituida, política falseada o firma no válida rechazadas.
3. Versiones/épocas antiguas y políticas divergentes de igual revisión rechazadas.
4. Rotación de `kid`, clave anterior retirada con limitaciones y ausencia de fallback.
5. Revocación por `epoch`, concesión antigua invalidada y nueva clave permitida.
6. Uso del mismo `jti` entre sesiones/generaciones rechazado.
7. Fechas futuras, expiraciones y claves fuera de vigencia rechazadas.
8. Dos pestañas, revocación durante una lectura suspendida: fail-closed.
9. Cierre/reapertura de pestaña tras actualización sin notificación recibida: la política persistida invalida el documento anterior.
10. Aborto inducido de una transacción IDB: sin política ni concesión parcialmente guardada.
11. Dos pestañas aplicando revisiones concurrentes: gana la revisión más alta, sin downgrade.

Se trata de **11 escenarios por navegador** con múltiples aserciones internas, no de 11 firmas aisladas por motor.

## Restricciones y puertas pendientes

- Sin `Supabase` real, migraciones, cloud, despliegue, merge, pagos, scoring ni manipulación de `main`; PR #21 permanece DRAFT.
- Faltan JWT reales, autorización de usuario/tenant por servidor, revocación global entre dispositivos, endpoint HTTP de políticas autenticado, protocolo de recuperación/rotación de raíz, firma y canonicalización interoperable con PostgreSQL, telemetría/limites de tamaño y un motor de sincronización integrado en la PWA.
- El `BroadcastChannel` es notificación, no autoridad; las transacciones IndexedDB controlan la consistencia de este harness.
- WebKit Linux **no equivale a iOS físico**. Falta presión real de espacio/`QuotaExceededError`, dispositivos iPhone y Android, y pruebas en PWA instalada.
- Validate CAP históricamente FAILURE por evidencia editorial R32 `2/2/1` frente a `3/3/3`; no tocar scoring.
- Preferencia futura de interfaz: el usuario quiere botones y secciones con **esquinas más cuadradas y menos redondeadas**, manteniendo estética minimalista; **C43 no cambia diseño**.

## Objetivo recomendado C44

Auditoría independiente de transiciones de confianza: revocación de raíz, riesgo de retrodatado con claves retiradas, corrupción manipulada de `trust`/ledger, colisiones multi-pestaña bajo caída del escritor, persistencia de anti-replay y limpieza acotada. Preparar criterios de puerta cloud sin habilitarla. Si se trabaja interfaz, adoptar preferencia de esquinas más cuadradas pero no modificarla en una ronda de seguridad.
