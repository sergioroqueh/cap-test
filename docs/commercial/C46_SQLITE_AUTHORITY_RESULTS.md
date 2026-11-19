# C46 — Autoridad SQLite desechable: atomicidad multi-proceso, caídas y persistencia (18/11/2026)

**Estado verificado:** [GitHub Actions C46 #44284286178](https://github.com/sergioroqueh/cap-test/actions/runs/44284286178) **SUCCESS** sobre commit funcional `55b1005bf8997d8f5a5c8ef716ce0c9e769b5761`: C46 **14/14 TAP**, C45 **30/30 TAP**, C44 **40/40 TAP**, C43 **24/24 TAP**, C42 **20/20 TAP**, C41 **20/20 TAP**. **148/148 nodos TAP PASS**, **138 casos efectivos** excluidos 10 agrupadores. Guardias `cloudConfigured=false`, no importación de C46 desde `src/` y ausencia de conexiones de producción **PASS**. Pruebas locales Node 22.16: 14/14 en tres ejecuciones. PR #21 DRAFT; CI PASS no autoriza producción.

## Contrato simulado y arquitectura

- `scripts/c46_sqlite_authority.mjs`: autoridad Node con `node:sqlite` de Node 22 (API experimental en esta familia), base SQLite creada **solo** por el harness en `os.tmpdir()`. En `WAL` + `synchronous=FULL`, las escrituras usan `BEGIN IMMEDIATE` y `COMMIT` para serializar múltiples procesos que usan el mismo archivo.
- `scripts/c46_sqlite_worker.mjs`: proceso Node independiente por llamada; recibe peticiones sintéticas mediante **stdin**, sin exponer credenciales en argumentos de línea de comandos. Las rutas de base se entregan exclusivamente desde el test. No hay servidor HTTP, endpoint, cliente Supabase ni conexión cloud.
- `scripts/test_sqlite_authority_c46.mjs`: 14 casos Node independientes, incluyendo hasta 12 procesos simultáneos, reinicios al abrir el mismo archivo, abortos reales de proceso `process.exit(91)` antes del commit y `process.exit(92)` después, revocación y prueba de restauración de archivo anterior.
- Los identificadores de tenant/dispositivo y credenciales de 32 bytes son **totalmente sintéticos**; la tabla `devices` guarda SHA-256 de credencial, compara en tiempo constante y vincula `tenantId`/dispositivo. Esto NO sustituye autenticación real ni gestión segura de secretos.
- Persisten `revision`, `epoch`, reloj lógico simulado en la base, caducidad de política, dispositivos revocados, ledger único por `(tenant_id,jti)`, desafíos por `(device_id,nonce)` y secuencia de auditoría. No se generan ni almacenan claves privadas de C45 y no hay integración con su firma: C45 se ejecuta como **regresión separada**.

## Resultados que deben verificarse en CI

1. Vinculación tenant/credencial y lectura desde procesos independientes.
2. Carrera de **12 procesos** contra el mismo `jti`, dos dispositivos del mismo tenant: un único ganador, reintentos idempotentes del ganador, rechazos del otro.
3. El mismo `jti` en tenants distintos no colisiona.
4. Dos procesos con el mismo challenge: un commit y un `CHALLENGE_REPLAY`.
5. Muerte del proceso **antes** del commit: transacción revertida, sin nonce ni challenge parcial.
6. Muerte **después** del commit pero antes de responder: retry con nuevo challenge devuelve idempotencia, sin duplicación.
7. Revocación durable tras reinicio y rechazo de `refresh` y `transfer`.
8. Caída antes/después de commit de revocación: nunca queda media revisión aplicada.
9. Carrera revocación/transferencia: si se acepta, el asiento de transferencia **precede** a la revocación en auditoría; en el orden contrario se rechaza.
10. Reloj persistente de la autoridad no toma hora declarada por cliente ni permite retroceder mediante la API sintética.
11. Política expirada y renovación requieren nueva revisión.
12. Capacidad del ledger (128 por defecto, 2 en stress puntual): `GLOBAL_LEDGER_FULL` sin expulsar entradas; reintento idéntico funciona.
13. **Amenaza conocida reproducida**: copiar una base válida anterior, revocar y restaurar aquella copia *deshace la revocación*. Si un testigo externo confiable aporta `minimumEpoch=2`, se detecta `TRUSTED_WITNESS_ROLLBACK`. Este valor suministrado por test es solo una condición simulada: **no existe testigo de confianza real ni antirrollback garantizado**.
14. Bytes de SQLite malformados fallan al abrir, sin regenerar silenciosamente contenido.

## Límites de seguridad: NO puerta de producción

- SQLite WAL de **un solo archivo en un mismo equipo/volumen** no demuestra consenso, garantía entre regiones, almacenamiento distribuido, filas PostgreSQL, autenticación de sesiones o alta disponibilidad. El esquema se crea en temporales de test y no constituye migración de base real.
- `node:sqlite` sigue siendo una API experimental de Node 22; no se ha probado Windows, disco físico bajo pérdida brusca de energía, corrupción parcial del WAL ni cuotas OS. El `process.exit` simula un fallo de proceso, no una pérdida de energía ni fallo de hardware.
- `minimumEpoch` solo sirve si viene de un testigo independiente, confiable y no restaurable junto a la base; aceptar un argumento administrado por el mismo atacante **no protege** del rollback. Auditoría SQLite y hashes de credencial también son manipulables por quien controle el archivo.
- Métodos `registerDevice`, `revokeDevice`, `advanceTime`, `renewPolicy` son **administración fixture** sin ACL real. El reloj es lógico y progresivo, pero no tiempo UTC verificado por fuente externa; el cliente real no debe poder llamarlos.
- El contador de desafíos crece sin estrategia segura de conservación, el máximo de nonces es configuración local del proceso, la base no cifra datos, ni existe backup transaccional probado bajo escritores activos. No hay JWT, identidad real de tenant, claves P-256 persistidas/rotadas ni contrato integrado de recibos firmados de C45.
- El carácter idempotente se define por tenant + jti + dispositivo + digest + epoch: reintentos tras cambio de epoch fallan cerrados aunque la operación vieja exista. Esta semántica debe resolverse para reintentos de respuestas perdidas después de una revocación.
- No hubo cambios en `src/`, `main`, scoring, interfaz, Supabase real, cloud, migraciones reales, merge, deploy ni pagos. `cloudConfigured=false`; PR #21 DRAFT. Validate CAP R32 permanece fuera de alcance.

**C47 propuesta:** diseñar una autoridad de recepción verificable con identidad real simulada, emisión de recibos P-256 y testigo monotónico independiente, más un plan de recovery/backup probado contra carreras sin habilitar producción. Se requiere revisión formal del modelo de amenazas antes de crear endpoints reales.
