# C44 — Auditoría de claves retiradas, manipulación local y ledger acotado (18/11/2026)

**Estado verificado:** [GitHub Actions C44 #44279603201](https://github.com/sergioroqueh/cap-test/actions/runs/44279603201) **SUCCESS** sobre commit `19202c6e27aa0d8216f23da78884617b0d1ac4e8`. C44: **19/19 subescenarios Chromium** y **19/19 WebKit Linux** (40 nodos TAP incluyendo agrupadores). Regresiones C43: **24/24 nodos TAP**; C42: **20/20**; C41: **20/20**. **104/104 nodos TAP PASS; 96 subescenarios efectivos**. Guardia cloud OFF, sin importaciones desde `src/`, sin secretos en módulo navegador: **PASS**. PR #21 DRAFT. Ninguna prueba constituye autorización para producción.

## Aislamiento y alcance

- `scripts/c44_trust_ledger.mjs`: módulo *fixture-only* separado de `src/`, con WebCrypto ECDSA-P256, raíz pública anclada exclusivamente desde bootstrap sintético. IndexedDB `rutacap-c44-fixture-<namespace>`; ninguna clave privada llega al navegador.
- `scripts/test_trust_ledger_c44.mjs`: **19 subescenarios por motor** (11 basales de C43 y 8 nuevos); claves privadas efímeras generadas exclusivamente en Node, Playwright Chromium y WebKit Linux, servidor en `127.0.0.1`, red exterior bloqueada.
- `.github/workflows/c44-trust-ledger.yml`: CI con regresiones independientes C43, C42, C41; guardias cloud apagado y sin importación desde el producto.

## Mejoras de defensa en el fixture

1. **Retiro sin aceptar documentos nuevos tras `retiredAt`**: a partir de la hora simulada de retiro, la clave `retired` rechaza incluso una concesión firmada con `issuedAt` retrodatado. Se verifica antes y durante la transacción. Clave `revoked` siempre deniega.
2. **Ledger `jti` validado**: campos críticos (identidad, huella, `kid`, revisión, época y fechas) se verifican antes de decidir si una concesión es idempotente. Un registro de formato erróneo falla con `LEDGER_CORRUPT`.
3. **Límite fail-closed** de 128 registros de fixture; si está lleno, nuevos `jti` devuelven `LEDGER_FULL`, sin expulsar nonces vivos automáticamente.
4. **Limpieza transaccional acotada** `pruneExpiredGrants({limit:1..32})`: solo elimina registros caducados, admite aborto inyectado, y detiene la operación ante corrupción estructural. Las concesiones antiguas expiran criptográficamente por claims y no reviven por limpieza.
5. **Concurrencia**: dos pestañas con el mismo `jti` aceptan una vez y permiten idempotencia solo al documento idéntico; variantes de sesión/documento se rechazan. Aborto y nueva pestaña sin estado parcial.

## Fallos que deben permanecer VISIBLES (no mitigados por un navegador)

- **Rollback auténtico de confianza**: se prueba deliberadamente que un atacante que reescribe *todo* IndexedDB con una política **anterior pero legítimamente firmada**, sus metadatos y su checksum correcto, puede hacer que `getPolicy` acepte esa política antigua. La firma demuestra autenticidad del emisor, NO frescura ni monotonicidad frente a un almacén totalmente hostil. Se exige autoridad remota confiable/contador de confianza fuera del mismo almacenamiento para cerrar este fallo.
- **Borrado del ledger**: un atacante capaz de eliminar una fila `jti` local puede reaceptar un documento todavía vigente como nuevo. Cambiar una fila para dejarla inválida sí se detecta, pero la ausencia no demuestra si el nonce nunca existió. Un hash local, aun recalculado, no sirve como autenticador independiente. No hay antirrepetición global entre dispositivos.
- **Reloj alterable**: la regla `retiredAt` utiliza el reloj proporcionado al cliente; un atacante que pueda manipularlo puede ocultar que el corte ocurrió. El control fuerte debe basarse en tiempo confiable del servidor o revocación dura.
- **Poda deliberada**: un `jti` expirado y eliminado puede ser reutilizado por una *nueva* concesión firmada. El objetivo es antirrepetición acotada a la ventana retenida, NO unicidad perpetua. No configurar como política de producción sin decisión explícita.
- Sin cuota real de SO, iPhone/Android físicos, Safari iOS, reglas de distribución de raíz confiable, JWT/HTTP/SQL, servidor de revocación ni sincronización real. Una firma válida tampoco resuelve el compromiso de su clave privada.

## Puertas

`cloudConfigured=false`, sin Supabase ni migraciones reales, deploy, merge, pagos, scoring, interfaz, o escrituras en `main`. PR #21 queda DRAFT. Validate CAP tiene fallo editorial R32 ajeno a C44, no se corrige aquí.

**Puerta C45 sugerida:** definir autoridad de política fresca y revocación global con tiempo confiable, estrategia de nonce en servidor y recuperación offline sin falsas garantías.
