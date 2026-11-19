# C30 — Diario transaccional local IndexedDB (17/11/2026)

**Estado:** rama `feat/cap-commercial`, PR #21 DRAFT. NO activado en Supabase ni producción. `cloudConfigured=false`. Sin migraciones, pagos, merge ni cambios en `gradeSession`.

## Implementación

- IndexedDB versión 2: almacenes nuevos `progressEvents` (eventId único, inmutable) y `syncMeta` (identificador persistente de dispositivo, contador lógico y origen de pregunta). Índice de búsqueda `clientId` para sesiones. Migración v1→v2 conserva los registros y sus IDs numéricos.
- Las respuestas de **estudio** y favoritos escriben evento y `QuestionProgress` en UNA transacción readwrite. Reintentos con el mismo `eventId` no suman de nuevo.
- En estudio, el `eventId` se guarda primero con la respuesta activa. Tras recarga, las respuestas C30 se vuelven a enviar de forma idempotente si la transacción quedó interrumpida. Respuestas antiguas sin `eventId` NO se contabilizan dos veces.
- La entrega de **examen** persiste `clientId` antes de escribir, y guarda todas las respuestas puntuables, su progreso y la sesión completa en UNA transacción. Reentregas con la misma clave y las mismas respuestas devuelven la sesión existente sin duplicar intentos.
- Los registros anteriores a C30 conservan el total anterior como un evento **legacy-baseline**, sin inventar intentos o tiempos individuales. Si procede, un solo baseline por pregunta, y operaciones posteriores referencian ese origen.
- La misma pregunta canónica CAP en convocatorias diferentes conserva el `questionnaireId` histórico del registro local preexistente.
- Se asigna y persiste `clientId` a sesiones heredadas sin modificar su identificador autoincremental.
- Importar progreso agregado NO puede sobrescribir un registro ya journalizado si cambia sus datos.
- La exportación añade `journal` y versión 3 para custodia. **El importador de la interfaz sigue restaurando únicamente progreso agregado**, no sesiones ni diario: todavía no debe presentarse como restauración completa.

## Pruebas
`scripts/e2e_local_journal_c30.mjs` en Chromium con identidad sintética y Vite local: funcionamiento sin red, recarga, deduplicación, favoritos, pregunta canónica compartida, usuarios A/B, migración IDB v1→v2, ID persistente de sesión heredada, replay de baseline usando C29, rechazo de importación conflictiva, entrega idempotente de examen, rollback de transacción, dos contextos de navegador y comprobación de cero peticiones a Supabase.

Workflow separado `.github/workflows/c30-local-journal.yml`: compilación TypeScript y pruebas reales de navegador; no toca base de datos.

## Bloqueos antes de sincronización real

1. Falta implementar restauración integral de `journal/sessions` del backup, comprobando procedencia/propietario.
2. No hay adaptador real PostgREST, paginación de snapshots, control de JWT en cada operación ni interrupción de operaciones iniciadas durante logout.
3. Los baselines heredados generados en distintos dispositivos no pueden sumarse a ciegas; C29 los rechaza si resultan ambiguos.
4. Hay que probar simultaneidad de pestañas y escenarios de fallo del almacenamiento persistente/limitaciones de cuota.
5. Sin aprobación para ejecutar SQL C28/C29, modificar ajustes de Supabase o habilitar nube.
6. R32 sigue con discrepancia congelada 2/2/1 vs 3/3/3; no se oculta ni se cambia puntuación.
