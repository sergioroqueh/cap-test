# C47 — Testigo SQLite separado, recibos P-256 y backup verificable (18/11/2026)

**Estado CI verificado:** [GitHub Actions C47 #44287579829](https://github.com/sergioroqueh/cap-test/actions/runs/44287579829) **SUCCESS** sobre commit `16c2e0fd1e10d9865202b584d8443bba9c22f14a`: C47 **16/16 TAP**, C46 **14/14**, C45 **30/30**, C44 **40/40**, C43 **24/24**, C42 **20/20**, C41 **20/20**; **164/164 nodos TAP PASS**, equivalentes a 154 casos efectivos al excluir 10 agrupadores. Guardias de aislamiento y cloud OFF PASS. Endurecimiento posterior `1ab45439f68a1cbfcef9dbb0bed14a0eae433a61` elimina la clave pública de los recibos y añade un test explícito; su ejecución [#44287998855](https://github.com/sergioroqueh/cap-test/actions/runs/44287998855) debe comprobarse de forma independiente. PR #21 DRAFT; no implica aptitud para producción.

## Implementación **SOLO harness**, sin despliegue

- `scripts/c47_witness_authority.mjs`: dos bases locales desechables de Node 22 `node:sqlite`: **autoridad principal** y **testigo separado**. El testigo conserva un contador monotónico `sequence`, `epoch`, huella SHA-256 determinista del estado principal y clave privada ECDSA-P256 en PEM de prueba. La clave permanece exclusivamente en proceso Node, pero **no está cifrada en el archivo testigo**: no constituye un HSM o almacén seguro.
- Escritura con orden fijo de bloqueos `witness BEGIN IMMEDIATE` y después `main BEGIN IMMEDIATE`. Tras mutar se actualizan versión y huella en testigo; **COMMIT de testigo ANTES del principal**. Esto **NO es una transacción atómica entre archivos**: un fallo entre ambos commits deja divergencia persistente, reconocida y bloqueada (fail-closed) sin recuperación automática. Los lectores y escritores cooperativos verifican la coherencia de ambos estados.
- El digest incluye metadatos, dispositivos, nonces y desafíos ordenados y normalizados. Detecta cambios o retrocesos del archivo principal siempre que el testigo original permanezca fuera del control del atacante. **SHA-256 local no es autenticación frente a quien pueda modificar ambos archivos**.
- `scripts/c47_witness_worker.mjs` ejecuta operaciones desde distintos procesos Node mediante **stdin**, sin URL ni servidor HTTP. `scripts/test_witness_authority_c47.mjs` incluye **16 pruebas** Node con procesos concurrentes, abortos de proceso, comprobaciones de recibos con Node/WebCrypto, backups y restauraciones, incluyendo ataques demostrativos.
- `exportC47Snapshot` utiliza `node:sqlite.backup` y comprueba consistencia del snapshot y estado del testigo antes/después de copiar. Si una escritura avanza el checkpoint en medio, se rechaza con `SNAPSHOT_RACE`. El manifiesto contiene versión, época y huella firmados P-256; no concede por sí mismo autorización de restauración.
- `restoreC47Snapshot` verifica la firma con la clave pública fijada por el harness, compara el manifiesto con el testigo vivo, valida SQLite y el hash del snapshot y restaura **solo a una ruta nueva** mientras retiene el bloqueo del testigo. Jamás sobrescribe un archivo abierto por escritores. Un backup antiguo válido es rechazado con `STALE_SNAPSHOT`.
- Los recibos individuales se firman tras el commit principal y se vinculan a `tenant`, `deviceId`, `challenge`, `jti`, `digest`, `revision`, `epoch`, hora lógica de Node, secuencia monotónica y huella del estado. Se firman mediante ECDSA-P256 SHA-256. La verificación WebCrypto se ensaya con JWK pública obtenida del bootstrap aislado, **no devuelta dentro del recibo**, y la clave privada no llega al navegador.

## Auditorías adversarias incluidas

1. Firma P-256 aceptada en Node y WebCrypto; persistencia de clave pública entre reinicios.
2. Alteración de cuerpo, identidad/challenge y raíz pública extraña no verifican.
3. Diez procesos Node compiten por el mismo `jti`: un primer aceptado, reintentos idénticos idempotentes y rechazos del dispositivo contrario.
4. Aislamiento entre tenants y repetición de challenge bloqueados.
5. Aborto **antes del commit testigo**: se revierten ambos.
6. Aborto **después del commit testigo, antes del principal**: divergen y el sistema bloquea nuevas operaciones tras reinicio; NO se corrige automáticamente.
7. Aborto **después del commit principal y antes del recibo**: reintento con challenge nuevo devuelve idempotencia.
8. Revocación persistente y carreras de revocación/transferencia.
9. Rollback aislado de la base principal detectado por testigo.
10. Manipulación de una fila principal detectada.
11. **LÍMITE REPRODUCIDO:** restaurar una copia anterior de **ambos archivos** puede volver a aceptar un dispositivo revocado: el testigo local no es independiente desde el punto de vista del atacante si comparte control de disco.
12. Backup firmado consistente, restauración a archivo nuevo y conservación del nonce.
13. Manifiesto adulterado y backup firmado antiguo rechazados.
14. Backup concurrente con varios escritores: resultado consistente o rechazo explícito del snapshot, jamás declarar válido un checkpoint anterior como si fuera actual.
15. Falta del archivo testigo falla cerrada sin regenerar confianza silenciosamente.

## Riesgos abiertos / límites estrictos

- **NO EXISTE TESTIGO EXTERNO CONFIABLE**: ambos SQLite están en el mismo equipo y bajo el mismo dominio de archivos. Contra rollback de ambos, no hay garantía monotónica. Firmas tampoco prueban frescura si la clave raíz y su estado se restauran juntos.
- Se utiliza **una clave privada PEM en claro dentro del archivo testigo** por comodidad de fixture. No es adecuada para producción ni resistente a compromiso de disco; tampoco hay rotación, certificados, distribución de raíz autenticada, autorización de administrador, revocación global entre regiones o servidor real.
- Dos archivos SQLite no proporcionan commit distribuido, aunque se aplique orden conservador de escritura; al producirse divergencia el prototipo se niega a operar hasta intervención/recuperación independiente. No hay protocolo seguro de reconciliación automática.
- La firma de recibo ocurre después del commit: pérdida de la respuesta obliga a reintentar con un **challenge nuevo**; el ledger decide la idempotencia. La hora de Node es **lógica**, progresada por fixture, NO tiempo UTC autenticado.
- Backup/recovery se valida solo sobre **archivo destino nuevo**; no es restore sobre base viva. Un actor externo no cooperativo que edite archivos mientras se restaura puede vulnerar las suposiciones del modelo; el lock protege únicamente a escritores que respetan el protocolo.
- Limitaciones generales: `node:sqlite` es experimental en Node 22; no probado corte físico de energía, corrupción de WAL/hardware, varios equipos, iOS Safari o Android físico. Sin JWT real, TLS, API, autenticación de tenant de producción, Redis/PostgreSQL distribuidos, despliegue ni endpoints reales.
- `src/`, interfaz, scoring, Supabase real, nube, migraciones reales, pagos, deploy, merge y `main` permanecen intactos. `cloudConfigured=false`. C47 es una prueba de modelo de amenazas, **no una puerta para producción**.

**Siguiente puerta posible C48:** contrato de testigo con separación administrativa auténtica y política explícita de recuperación ante divergencia, sin habilitar cloud; exigir pruebas de compromiso de raíz y de restauración de dos archivos y estudio de idempotencia después de rotación de claves.
