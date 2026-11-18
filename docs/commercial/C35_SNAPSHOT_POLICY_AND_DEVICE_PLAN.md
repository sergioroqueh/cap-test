# C35 — Límites de instantáneas y plan de pruebas físicas (18/11/2026)

**Estado:** exclusivamente desarrollo en \`feat/cap-commercial\`, PR #21 DRAFT. Prohibido activar la nube, aplicar migraciones a Supabase real, fusionar con \`main\`, desplegar, cobrar o cambiar el scoring sin autorización separada.

## Qué cambia en C35
El archivo \`docs/commercial/sql/C35_snapshot_lifecycle_fixture.sql\` amplía el fixture C34 con **dos funciones exclusivamente para PostgreSQL desechable**. No se importan desde la aplicación ni se ejecutan sobre el proyecto \`rutacap-dev\`.

- **Cuotas sintéticas:** máximo de 2 instantáneas activas por propietario, 3 filas por instantánea y 2.048 bytes de JSON de origen (límites deliberadamente reducidos para forzar fallos en CI, **no tarifas ni capacidades de producción**).
- **Caducidad:** 10 minutos de TTL por instantánea. Una limpieza de backend borra manifiestos caducados y, por claves externas con cascada, todas sus páginas.
- **Reintentos:** mismo propietario + \`snapshot_id\` + checkpoint devuelve \`existing\`, sin sumar ni duplicar filas. Mismo ID con checkpoint diferente se rechaza.
- **Atomicidad:** se materializan filas y manifiesto en una sola llamada de backend; errores de cuota no dejan medias instantáneas.
- **Concurrencia:** bloqueo transaccional por propietario con \`pg_advisory_xact_lock\` para evitar que dos creaciones salten el límite de instantáneas. La prueba de C34 usa \`REPEATABLE READ\` para fijar el origen; C35 no constituye todavía una prueba de dos sesiones SQL simultáneas reales.
- **Aislamiento y permisos:** las funciones se crean con \`SECURITY INVOKER\`, se revoca \`EXECUTE\` a \`PUBLIC\`, \`anon\`, \`authenticated\` y \`service_role\`. Son llamadas simuladas de backend privilegiado. Los clientes siguen limitados a \`SELECT\` con RLS y JWT propio sobre las tablas del fixture.
- **Test de límites:** un propietario A supera la cuota de instantáneas y luego la de filas; B supera la cuota de bytes; las dos situaciones rechazan la creación sin dejar datos parciales.
- **Verificación de retención:** un snapshot materializado conserva sus filas originales aunque el historial vivo del usuario incorpore más eventos. La caducidad elimina filas viejas sin afectar las demás.

**Importante:** C35 **no diseña todavía un RPC desplegable**. Derivar el propietario exclusivamente del JWT comprobado, configurar políticas de coste/cuotas reales, rate limiting, protección contra DoS, estimar crecimiento, permitir reanudación segura y garantizar consistencia en múltiples lecturas de servidor requieren una revisión independiente. Las cuotas de 2/3/2.048 son solo herramientas de test. El borrador C28/C29 continúa sin aplicarse en Supabase.

## Plan de pruebas físicas (PENDIENTE; no realizadas)

La compatibilidad WebKit de C34 se probó en Linux mediante Playwright, no en un iPhone. **No hay que instalar ni ejecutar nada en el ordenador del trabajo** para C35. Para pruebas físicas posteriores se necesitará una URL de pruebas accesible mediante una vía local/LAN controlada o un despliegue preview **autorizado explícitamente**; este documento no autoriza publicar ni abrir el acceso externo. Usar únicamente perfiles y copias sintéticas, nunca exportaciones personales o cuentas de clientes.

| Caso | Dispositivo y pasos | Resultado esperado | Estado |
|---|---|---|---|
| IOS-01 | Safari físico: crear una respuesta en invitado, Perfil → Exportar copia | Descarga JSON válida, sin cerrar la pestaña ni perder progreso | No ejecutado |
| IOS-02 | Safari físico: pulsar «Compartir archivo», si se muestra, elegir «Guardar en Archivos» | Acción por gesto explícito; archivo local, sin compartir con terceros automáticamente | No ejecutado |
| IOS-03 | Safari físico: borrar progreso del invitado, seleccionar archivo guardado, inspeccionar y restaurar | Respuestas y sesiones completas, sin duplicados y con feedback visible | No ejecutado |
| IOS-04 | PWA añadida a pantalla de inicio: repetir exportar/restaurar y abrir Archivos | Comportamiento compatible o alternativa documentada para ese iOS | No ejecutado |
| AND-01 | Android Chrome físico: exportar, abrir Descargas/Archivos, reimportar | JSON íntegro y selección correcta | No ejecutado |
| AND-02 | Android PWA instalada: repetir el caso con pantalla bloqueada/reanudada | No se atribuye importación a la cuenta equivocada; mensaje de error si hubo interrupción | No ejecutado |
| A11Y-01 | iOS VoiceOver: recorrer «Seleccionar copia», vista previa, Cancelar y Confirmar | Orden de lectura lógico; aviso anunciado; botones operables sin gestos ocultos | No ejecutado |
| A11Y-02 | Android TalkBack: repetir el flujo con errores de JSON y checksum | Anuncio de errores, foco recuperado y contraste legible | No ejecutado |
| DATA-01 | iOS/Android: archivos sintéticos de 2, 10, 40 y más de 50 MB | Los de hasta 50 MB se procesan si el dispositivo tiene memoria/espacio; más de 50 MB se rechazan antes de parsear | No ejecutado |
| AUTH-01 | Seleccionar copia del perfil A, cerrar sesión o cambiar al B antes de confirmar | Vista previa descartada; ni exportación ni restauración en perfil B | No ejecutado |
| NET-01 | Repetir en modo avión, siendo invitado y con banco ya instalado/cargado | Copia local independiente de la red, o fallo de PWA descrito con evidencia | No ejecutado |

**Cómo recoger evidencia:** anotar dispositivo/modelo, versión exacta de iOS/Android, Safari/Chrome, fecha, estado PWA y resultado; si algo falla, guardar solo una captura sin direcciones de correo, tokens ni datos personales. Nunca subir archivos de backup con respuestas de usuarios a tickets públicos.

## Umbrales para la próxima decisión comercial/técnica
- Una prueba Playwright **no sustituye** iOS/Safari físico ni VoiceOver/TalkBack.
- Antes de servicio cloud: autorización del plan y presupuesto, políticas RLS/JWT verificadas por A/B, consentimiento explícito a subir historial, límites/retención, autenticación de la propiedad por servidor, expiración, cambio de dispositivo/logout, protocolo snapshot \`begin/page/finish\` transaccional auténtico y migración revisada.
- Antes de salir de DRAFT o publicar: resolver por evidencia editorial la discrepancia R32 de frecuencias históricas **2/2/1 frente a 3/3/3**. No corregirla de forma cosmética ni cambiar puntuación.

## Evidencia de referencia
- C34 Playwright Chromium + WebKit Linux y SQL PostgreSQL desechable: CI **44202295750 SUCCESS**.
- C35: \`.github/workflows/c35-snapshot-lifecycle.yml\` ejecuta Node/build, contratos sintéticos y la cadena SQL C15 → C28 → C29 → C34 → C35 en PostgreSQL 17 efímero. Consignar resultado y hash al cerrar la ronda.
