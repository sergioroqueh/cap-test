# C45 — Autoridad global simulada, frescura, revocación y recuperación offline (18/11/2026)

**Estado verificado:** [GitHub Actions C45 #44282014144](https://github.com/sergioroqueh/cap-test/actions/runs/44282014144) **SUCCESS** sobre commit `388d8ea073c602225ecfe3932ef37ea0f594fbc5`. C45 **30/30 nodos TAP PASS** (4 tests Node + 12 subescenarios Chromium + 12 WebKit Linux + 2 agrupadores); C44 **40/40**, C43 **24/24**, C42 **20/20**, C41 **20/20**. **Total 134/134 nodos TAP PASS**, 124 escenarios efectivos sin agrupadores. Guardias `cloudConfigured=false`, aislamiento `src/` y separación clave privada PASS. PR #21 DRAFT. C45 no habilita ningún componente de producción.

## Arquitectura mock-only

- `scripts/c45_mock_authority.mjs`: autoridad Node en memoria que genera su raíz P-256 privada efímera y mantiene hora del servidor, política revision/epoch, dispositivos revocados, registro de desafíos y ledger de `(ownerId,jti)`. No usa DB, SQL, Supabase, nube ni escucha en red. Los cambios de estado y la comprobación del nonce se ejecutan sin `await` en una sección síncrona de **un único proceso Node**.
- `scripts/c45_browser_authority.mjs`: verificador WebCrypto ECDSA-SHA256; solo recibe JWK pública por bootstrap aislado, devuelve una confirmación firmada con identidad, challenge UUID, `jti`, digest, revision/epoch y hora de **servidor**. No usa `Date.now()` para autorizar una operación; nunca puede crear una firma.
- `scripts/test_mock_authority_c45.mjs`: arnés Playwright con Chromium y WebKit Linux. Un servidor ligado exclusivamente a `127.0.0.1` sirve **solo HTML vacío y módulos públicos de fixture**. El transporte de autoridad es un puente inyectado en Playwright `exposeFunction` hasta Node, no `fetch` ni un endpoint real.
- La credencial de dispositivo que ve la pestaña es **sintética y de desarrollo**. No se ha diseñado autenticación segura, protección contra XSS, JWT, cookie de sesión, autorización real de tenant, proof-of-possession ni endpoint de producción.

## Reglas modeladas

1. Toda transferencia se **decide y registra en la autoridad Node**, no en IndexedDB. Primero se exige una actualización online `refresh`, después el servidor verifica cuenta/dispositivo, `revision`, `epoch`, identidad, nonce y digest. Sin una nueva respuesta firmada no hay operación online autorizada.
2. Un `jti` de la misma cuenta usado por otro dispositivo (incluso con el mismo digest) falla `GLOBAL_REPLAY_REJECTED`. Repetir el mismo digest y nonce en el dispositivo original es `idempotent`. El ledger es global solo dentro de **esa instancia de Node**.
3. El servidor rechaza políticas antiguas y épocas obsoletas con `POLICY_STALE`; la revocación de dispositivo falla `DEVICE_REVOKED`. El cliente compara firmas y vincula desafío/identidad/política/tiempo/digest para detectar respuesta manipulada o reproducida.
4. El reloj autoritativo es el del mock Node, progresivo mediante `advance(ms)`. Modificar `Date.now` en el navegador no cambia la decisión. Política caducada da `POLICY_EXPIRED` hasta una actualización firmada en la autoridad.
5. Sin conexión, `readOffline` devuelve **solo lectura, estado no verificado**, incluso si existe una respuesta firmada en IDB. Al reabrir, `transfer` exige un `refresh` nuevo; una política antigua restaurada en IDB puede seguir almacenada, pero **no autoriza nada**.
6. Abortar una escritura IDB después de un commit del servidor no revierte el commit global: un reintento del mismo dispositivo es idempotente. Una caída de la pestaña puede dejar estado local incompleto sin generar doble transferencia en el mock.
7. El modelo no elimina automáticamente nonces. Con capacidad de 128 entradas por defecto, falla con `GLOBAL_LEDGER_FULL`, lo que implica que una persistencia y política de retención de producción son obligatorias.

## Amenazas comprobadas por suite

- Dos dispositivos, mismo usuario, nonce simultáneo (solo uno vence); otra cuenta puede usar el mismo identificador de nonce sin interferir.
- Identidad y credencial falseadas; compromiso o suplantación de raíz pública; modificaciones a política, hora, dispositivo y firma; reproducción de una respuesta firmada para un desafío nuevo.
- Revocación y cambio de época tras el `refresh`; transferencia en pausa cuyo servidor ya cambió de estado; ausencia de autoridad; caché IDB firmada pero intencionalmente restaurada a epoch anterior.
- Reloj del navegador incorrecto, política caducada y nueva versión; saturación del ledger; aborto de almacenamiento local seguido de idempotencia.
- Recuperación offline degradada a lectura sin validación de autorización y reconexión obligatoria.

## Limitaciones y puertas de producción NO SUPERADAS

**NO se ha solucionado la seguridad real mediante un Node mock.** Su ledger en memoria se pierde al reiniciar; dos instancias Node separadas no comparten transacciones; la sincronización real exigiría operación de nonce atómica en DB y pruebas con concurrencia distribuida, cuota y recuperación. Tampoco hay autenticación real, claves raíz distribuidas de forma autenticada, almacenamiento seguro de privados, TLS, política de revocación auditable, hardware seguro ni dispositivos físicos.

El transporte `exposeFunction` es un truco del harness: no es seguro ni desplegable. La raíz pública proviene del propio test. Las credenciales sintéticas de cada dispositivo se exponen a ese navegador y no constituyen una protección resistente a robo. Un atacante que controla JavaScript/OS/cliente puede alterar la UI y los datos locales; solo un servidor real de confianza puede decidir y comprometer operaciones.

Una respuesta firmada que llega después de una revocación solo atestigua **una operación ya decidida por Node** antes de la revocación; no otorga un permiso de sincronización futuro. No existe lease offline que autorice transferencias. WebKit Linux no equivale a Safari iOS. No se han probado iPhone, Android, PWA instalada, interrupción OS, cuota real ni restauración de bases persistentes.

C45 no modifica `src/`, `main`, scoring, interfaz, Supabase real, cloud, migraciones, deploy, merge ni pagos. `cloudConfigured=false`; PR #21 permanece DRAFT. Validate CAP R32 sigue separado, no intervenir.

**C46 candidata:** diseñar primero un protocolo de servidor real y su contrato/amenazas en papel o en SQLite/PostgreSQL desechable, incluyendo autenticación del tenant, operación transaccional y recuperación de idempotencia tras reinicio; no habilitarlo en producción sin revisión adicional.
