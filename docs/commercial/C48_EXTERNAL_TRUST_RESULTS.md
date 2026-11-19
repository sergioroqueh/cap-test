# C48 — Dominio monotónico simulado, recuperación y compromiso de clave (18/11/2026)

**ALCANCE: exclusivamente fixture sintético/desechable. NO APTO PARA PRODUCCIÓN.**
PR #21 DRAFT en 'feat/cap-commercial', sin merge, sin UI, scoring, pagos, cloud,
Supabase real, migraciones ni deploy. La CI específica debe evaluarse por commit;
no se anticipa un resultado no ejecutado.

## Motivación y diseño

C47 se basaba en dos archivos SQLite bajo el mismo control local: el rollback completo
de principal + testigo restauraba una autorización revocada. C48 añade un **mock de
dominio de confianza independiente del backup C47**, representado por un objeto con
estado privado de vida limitada, sin API de importación/restauración local. Su contador,
época, huella y ledger de nonce sobreviven a la sustitución de esos dos archivos
**solo mientras ese mock sigue vivo**. Esto NO es separación administrativa real,
servicio remoto, hardware aislado ni persistencia entre reinicios del testigo externo.

- 'scripts/c48_external_witness_mock.mjs' es un harness sin endpoints. Fija una
  raíz pública inicial fuera de los recibos, un checkpoint de secuencia/época/digest
  C47 y su huella de raíz local. Cada transición pasa por comprobación previa de
  igualdad exacta con la autoridad externa y comprobación posterior 'seq+1'.
- La autoridad C48 firma atestaciones P-256 con un dominio distinto al de C47.
  Son verificables exclusivamente a partir de la raíz externa fijada fuera del
  recibo. La rotación exige certificado firmado por la clave anterior y prueba de
  posesión firmada por la nueva; la generación actual y el mínimo de secuencia
  son entradas externas obligatorias a la verificación.
- Un 'jti' de transferencia queda vinculado externamente a tenant, dispositivo,
  digest y época; el mismo intento con challenge nuevo puede ser idempotente,
  mientras que un segundo dispositivo no puede reutilizarlo. El estado persiste
  entre rotaciones **dentro de la vida del mock**. Los identificadores de operación
  ya confirmada no pueden ejecutar una segunda operación.
- El testigo original C47 y la clave privada PEM del archivo witness NO se
  modifican; el test comprueba que robar esa clave permite falsificar una firma
  local, pero no generar una atestación externa auténtica.
- El nuevo código no se importa desde 'src/' y no activa nube, nuevas tablas de
  producción ni supuestas garantías de seguridad globales.

## Política explícita de recuperación

1. **Igualdad con checkpoint externo**: operación normal admitida tras verificar
   raíz local, secuencia, época y digest.
2. **Rollback de ambos archivos C47**: 'ROLLBACK_DETECTED'; revocaciones no
   regresan para un cliente que conserva la raíz/checkpoint de C48.
3. **Diferencia en misma secuencia**: 'STATE_FORK_DETECTED'. Raíz local cambiada:
   'LOCAL_ROOT_SUBSTITUTION'.
4. **Crash C47 antes del commit witness**: el estado externo coincide con ambos
   archivos; un nuevo intento es admisible.
5. **Crash C47 después del witness antes del principal**: C47 da
   'WITNESS_DIVERGENCE'. La recuperación exige una pareja de copias EXACTAMENTE
   igual al último checkpoint externo, reconocimiento explícito del operador de
   fixture y archivos destino NUEVOS. No sobrescribe datos activos.
6. **Crash después del commit principal antes de atestar externamente**:
   'UNATTESTED_FORWARD_STATE'; la restauración descarta operaciones locales
   confirmadas, por lo que se rechaza con
   'UNATTESTED_FORWARD_REQUIRES_INVESTIGATION'. No se adopta automáticamente el
   nuevo estado ni se finge atomicidad distribuida.
7. **Copia antigua firmada**: no basta la firma local C47; si el estado no es
   exactamente el de C48, se rechaza.
8. **Aprobación simulada**: la cadena textual literal del fixture NO autentica a
   un operador real. Una autorización de recuperación real necesitaría protocolo
   independiente, auditoría, quorum y mecanismos anti-replay duraderos.

## Riesgo de claves: límites demostrables

- **Compromiso de clave C47 local**: el atacante puede firmar contenido local
  arbitrario; el root externo todavía impide presentar ese contenido como
  atestación externa mientras su clave y estado sigan aislados.
- **Compromiso de raíz C48 RETIRADA**: el material filtrado aún permite firmar
  pruebas históricas con firma criptográficamente válida; sin embargo, una
  verificación que exige generación ACTUAL las rechaza. Nunca se debe confiar
  en la generación anunciada por el propio atacante.
- **Compromiso de raíz C48 ACTIVA**: un atacante puede firmar atestaciones
  futuras verosímiles. El test reproduce explícitamente que la firma falsa
  pasaría la verificación criptográfica sin estado independiente. Un aviso de
  compromiso en el mock bloquea operaciones/rotación; ni la autorrotación
  firmada con la clave comprometida ni los recibos bastan para restaurar
  confianza. Hace falta nueva raíz autenticada fuera de banda.
- La clave privada C48 se aloja solo en memoria de este proceso de prueba; una
  función con nombre explícito de ataque permite simular su filtración.
  NO es un HSM, y no se ha probado invulnerabilidad frente a proceso hostil.

## Pruebas de aceptación y amenazas pendientes

'scripts/test_external_witness_c48.mjs' incluye rollback completo, revocación,
recuperación legítima y obsoleta, bloqueos pre/post commit, workers Node, nonce
e idempotencia tras rotación, cadena de rotación alterada, raíz sustituida,
exfiltración de clave local, filtración de raíz externa antigua y activa,
y ausencia de atestación al saltarse el coordinador.

Limitaciones: el mock C48 vive EN EL MISMO PROCESO que el test. No ofrece
durabilidad, aislamiento por credenciales del SO, consenso, red, TLS, identidad
de operador, autorización de dispositivos en servidor, monotonicidad tras reinicio
del testigo externo, protección contra captura de todas las raíces, transacción
atómica distribuida, prueba de fallo eléctrico ni hardware físico. El modelo
confía en un único punto de entrada cooperativo, no impide a otros escritores
alterar C47. Prueba de modelo de amenazas: **NO habilitar producción**.
