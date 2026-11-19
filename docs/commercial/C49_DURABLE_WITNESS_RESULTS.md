# C49 — Testigo durable en procesos separados, intenciones y recuperación (18/11/2026)

**ÁMBITO ESTRICTAMENTE SINTÉTICO. NO APTO PARA PRODUCCIÓN.**

**CI verificada sobre commit `6401948a6260df28d87b6ba669b9c92449599b31`:** [GitHub Actions C49 #44298261637](https://github.com/sergioroqueh/cap-test/actions/runs/44298261637) **SUCCESS**. C49 **18/18**, C48 **14/14**, C47 **16/16**, C46 **14/14**, C45 **30/30**, C44 **40/40**, C43 **24/24**, C42 **20/20**, C41 **20/20**: **196/196 nodos TAP PASS** (186 casos efectivos sin 10 agrupadores). Chromium/WebKit e aislamiento de `src/`, `cloudConfigured=false`, sin red/endpoints ni base real: **PASS**. La CI sobre el commit documental posterior debe comprobarse separadamente.



## Objetivo y arquitectura

C48 mantenía la raíz externa, el contador, la época y los nonces en memoria del
mismo proceso. C49 traslada ese estado a una **base SQLite propia en un directorio
de fixture diferente**, accedida mediante un **worker Node de vida corta por
petición**; una ejecución posterior abre los mismos datos sin heredar memoria.
C47 mantiene sus otros dos SQLite sintéticos. No hay red ni servidor real.

El protocolo es **intención durable → operación C47 → atestación/commit de
la autoridad C49**. La autoridad C49 registra una única operación pending
mediante BEGIN IMMEDIATE; un escritor C47 distinto realiza la mutación; la
fase finalize verifica la huella de la intención, la raíz local, el incremento
exacto de secuencia y, en transferencias, recibo firmado C47 y ledger de
nonces externos. En una transacción externa se actualizan checkpoint,
nonce y resultado firmado, marcando committed. El estado permite recuperar
**la respuesta** de una confirmación ya realizada mediante status(opId),
sin volver a ejecutar la operación. Las operaciones aborted conservan su ID.

El bloqueo de SQLite C49 serializa peticiones que cooperan, pero NO mantiene
un bloqueo distribuido a lo largo de las tres fases. La existencia de una
intención pendiente bloquea nuevos trabajos del coordinador: esto reduce
concurrencia deliberadamente para que un hueco quede en cuarentena. No
previene a escritores que salten el coordinador.

## Política explícita de fallos y recuperación

- Reinicio tras bootstrap: carga raíz original y checkpoint externos;
  un archivo remoto ausente NO se autorregenera; una inicialización exige
  comando explícito y estado local genesis. El caller retiene la raíz pública
  obtenida durante un bootstrap de confianza, fuera del recibo.
- Caída después de **prepare**: pending durable; abortPending solo admite
  resolución si el estado local sigue exactamente en el checkpoint anterior.
- Caída después del commit C47 antes de finalize: avance local no atestado;
  no se adopta ni revierte automáticamente y se bloquea (fail closed).
- Caída antes del commit externo: operación pending con C47 adelantado;
  queda bloqueada sin reconciliación automática.
- Caída después del commit externo antes de enviar respuesta: status(opId)
  obtiene el resultado signed durable, no se repite C47.
- Revocación atestada: rollback de ambos archivos C47 se bloquea, aun cuando
  otro proceso abra posteriormente la SQLite externa.
- Recuperación de archivos C47 a nueva ruta: únicamente si la copia
  coincide EXACTAMENTE con checkpoint externo confirmado, no hay pending,
  el destino está vacío y hay aprobación **literal de fixture**, que NO es
  autenticación real de operador.
- Copia antigua y avance C47 sin atestación: quedan bloqueados.
- Las rotaciones P-256 firmadas por anterior y nueva raíz son persistentes;
  nonces y el estado idempotente permanecen entre reinicios/generaciones.
- Marcado de compromiso de clave activa se conserva entre reinicios y
  bloquea inspect/prepare/rotate.
- Restaurar la SQLite externa a un checkpoint anterior, dejando C47 actual,
  se detecta como un avance no atestado.
- **ATAQUE IRRESOLUBLE DEMOSTRADO**: restaurar los tres SQLite a un mismo estado
  anterior puede revivir autorizaciones revocadas si se pierde TODO
  checkpoint externo realmente inmutable. Solo un *cliente que conserve
  independientemente* un mínimo de secuencia/generación y la raíz original
  puede rechazarlo; una raíz pública fija sin high-water no es suficiente.

## Claves y límites

Se guardan PEM privadas P-256 **sin cifrar** en la SQLite externa del fixture.
Un actor capaz de leerlas puede fabricar pruebas criptográficas válidas; los
procesos separados y directorios distintos NO constituyen separación
administrativa ni aislamiento de hardware. No hay HSM, claves de producción,
autenticación de operador, TLS, consensus, multi-región, UTC confiable,
pruebas de cortes de energía, durabilidad de disco certificada, ni
atomicidad transaccional entre C47 y C49. La SQLite externa y ambas locales
siguen bajo la misma cuenta de SO y mismo sistema de archivos: el nombre
externo describe exclusivamente la frontera SIMULADA del backup local.

La CI descrita en el encabezado confirma las pruebas sobre el código C49 auditado.
Cualquier cambio posterior exige una nueva verificación.

Archivos:
- `scripts/c49_durable_external.mjs`
- `scripts/c49_external_worker.mjs`
- `scripts/test_durable_external_c49.mjs`
- `.github/workflows/c49-durable-witness.yml`

Sin tocar `src/`, UI, scoring, base de preguntas, Supabase real, migraciones,
cloud, pagos, despliegue ni `main`. PR #21 debe permanecer DRAFT.
