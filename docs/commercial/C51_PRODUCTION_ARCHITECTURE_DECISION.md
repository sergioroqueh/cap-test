# C51 — Decisión de arquitectura para una beta comercial realista (18/11/2026)

**Estado:** DISEÑO PROPUESTO, NO IMPLEMENTADO. PR #21 continúa DRAFT.
**Restricciones:** ninguna escritura/conexión a Supabase real, migración, activación cloud, despliegue, pago, UI, scoring, banco ni merge. `main` intacta. No solicitar pruebas locales al usuario en el trabajo.

## 1. Decisión y alcance

C41–C50 han explorado errores de concurrencia, snapshots, firmas, revocación y rollback, con fixtures sintéticos. No debemos trasladar automáticamente las bases SQLite testigo, firmas PEM de prueba ni los observadores de C47–C50 a producción.

**Arquitectura mínima candidata:** frontend **React + Vite + PWA** (mantener), publicación estática en **Vercel** cuando se autorice; **Supabase Auth** para identidad, **Postgres + RLS** para datos de cada usuario y para la autorización del servicio, **una única vía transaccional de servidor** para operaciones privilegiadas. Una Edge Function o RPC privada podría ser el punto de entrada de esas operaciones; la selección final requiere revisión de autenticación, roles, transacciones y límites de ejecución. No implementar una segunda autoridad de firmas ni servicios nuevos por defecto.

No hacer depender todo el uso offline de un check remoto. Una operación como "responder pregunta y consultar historial local" debe seguir funcionando sin servidor. La sincronización entre dispositivos y los derechos de acceso comerciales sí requieren conexión y confirmación de backend.

**Importante:** el testigo C50 no es una exigencia para la beta. Un backend transaccional con integridad, copias operativas, registros y procedimientos administrativos verificables es una base más pragmática. No se promete resistencia a compromiso total de proveedor ni a rollback privilegiado de todos sus respaldos.

## 2. Responsabilidad de cada componente

| Capa | Función propuesta | Nunca debe decidir |
|---|---|---|
| Vite/React/PWA | Pantallas, modo estudio/examen, progreso local, IndexedDB, exportación de copia, cola offline, comunicación con API | Licencias, revocaciones definitivas, permisos administrativos |
| Vercel | Alojamiento frontend estático, HTTPS, rutas SPA, cabeceras y caché, entornos preview cuando se aprueben | Única fuente de verdad de dispositivos/licencias |
| Supabase Auth | Inicio de sesión, sesión y validación de identidad en servidor | Validación de contenido y procedencia de respuestas |
| Postgres + RLS | Datos segregados por user_id, eventos, sesiones y estados de cuenta, transacciones | Aceptar arbitrariamente user_id proporcionados por cliente |
| Endpoint servidor privilegiado (elección futura) | Alta/revocación de dispositivos, cambios de permisos, operaciones idempotentes con autorización comprobada | Confiar solo en los claims editables, en tokens caducados o en el reloj del navegador |
| Copias y operaciones | Recuperación, auditoría, alertas y restauración controlada | Restauración silenciosa de estados de autorización más antiguos |

El catálogo de preguntas descargado por una PWA está físicamente disponible en el navegador: si el paquete está incluido entre los archivos estáticos públicos, **no constituye contenido protegido**. No basar un plan comercial en ocultar preguntas ya incluidas en el bundle público. Las futuras funciones de valor podrían ser sincronización, explicación de errores, contenido verificado y actualizado, analítica de progreso o funcionalidades específicas, sujetos a derechos de fuente y política de producto.

## 3. Datos y confianza

**Reutilizar los diseños existentes sin aplicarlos aún:** `C28_full_fidelity_schema_draft.sql`, `C29_event_ledger_draft.sql`, el journal IndexedDB C30, el backup v3 C31 y los contratos C29–C44.

Modelo conceptual mínimo, sujeto a revisión de SQL/RLS antes de cualquier ejecución:
- **perfil de usuario** con `user_id` de Auth y datos estrictamente necesarios;
- **dispositivos autorizados** por usuario con identificador pseudónimo, estado, revocación y contador/revisión servidor;
- **eventos de progreso** append-only y sesión completa con `eventId`/`clientId` idempotentes, dueño derivado de sesión validada; tamaño y origen verificados;
- **metadatos de sincronización**: cursor de servidor, versión de esquema, asociación cuenta/dispositivo y conflictos;
- **permisos comerciales** solo cuando haya un producto de pago definido; controlados en servidor, fuera de metadatos editables por el usuario.

No mezclar métricas educativas declaradas por cliente con acreditación oficial, autoridad de examen, pago o titularidad de suscripción. No crear tablas de pagos ni integrar pasarelas ahora.

**RLS y servidor:** negar acceso anónimo a tablas privadas, aplicar `auth.uid()` + predicado de propietario, impedir modificaciones de IDs de dueño y escritura sobre sesiones inmutables; activar RLS en tablas expuestas. Mantener funciones privilegiadas fuera del esquema público expuesto, permisos mínimos y sin `service_role`/secretos en el navegador. Los claims de sesión pueden quedar obsoletos después de revocaciones: reconsultar el estado de autorización central para las acciones sensibles. JWT y RLS protegen solicitudes online, **no pueden revocar datos ya descargados en un dispositivo offline**.

En toda transferencia: identidad revalidada, consentimiento de importación del invitado, separación A/B, cancelación por logout, transferencias paginadas completas, digest, idempotencia y conflicto explícito. Nunca reconstruir respuestas exactas a partir de contadores agregados antiguos; usar baseline controlado y respaldo completo v3.

## 4. Orden propuesto, sin sobreingeniería

### Etapa 0 — Higiene de repositorio y contrato (sin servicios)
- C51 es solo documentación. Dejar PR DRAFT; no activar cloud ni tocar scoring/UI.
- Registrar **incidencia editorial R32** (artefacto `technical_review_r32_candidates.json` ausente en Verify staged R32 evidence) como trabajo separado: investigar ruta/paso de generación sin corregir respuestas ni frecuencias en esta etapa.
- Revisar `package.json`: dependencias `latest`, versión de Node, integridad lockfile, advertencias `npm audit`, build reproducible; proponer versión fija tras inspeccionar pruebas existentes, en rama de mantenimiento aprobada.
- Revisar licencias/fuente y vigencia de exámenes por comunidad: una etiqueta regional no acredita cobertura territorial.

**Salida:** contrato de datos, mapa de amenazas, coste/operación estimados y puertas de aprobación, sin un solo servicio activado.

### Etapa 1 — Auth y segregación (requiere autorización expresa para servicios)
- Mantener el Google OAuth PKCE local verificado C22, evaluar configuración de dominio oficial, allowlist de redirecciones y consentimiento de Google; no publicar identificadores de desarrollo.
- Aprobar una migración nueva basada en C28/C29, con RLS y grants revisados, para un **entorno RutaCAP separado de producción**.
- Probar A/B/guest real, JWT expirado, permisos de visitante anónimo, logout y sesión recuperada. Verificar advisors y test de acceso de usuario B a datos A.
- Cambiar el guard local de autenticación **solo** en la fase de preview aislado. `cloudConfigured=false` sigue hasta la siguiente puerta.

**Go/no-go:** no hay fuga de propietarios ni escritura anónima a datos privados.

### Etapa 2 — Sincronización y recuperación (servicio aislado)
- Conectar adaptador remoto a contratos C29–C31; no reescribir el motor de exámenes ni puntuación.
- Validar con dos cuentas y dos dispositivos: eventos idempotentes, sesiones inmutables, cancelación en cambio de propietario, conflictos de baseline, export/import v3, red caída y restauración.
- Los metadatos educativos no son fuente de verdad de autorizaciones. Conservar backup local/exportable aunque haya servicio online.

**Go/no-go:** A no ve nada de B; reiniciar, desconectarse y repetir no duplica eventos ni pierde sesiones.

### Etapa 3 — Autoridad comercial reducida (solo cuando se defina el producto)
- Elegir un servicio servidor para operaciones privilegiadas, con una transacción Postgres por actualización, control de identidad/dispositivo, generación de revocación, idempotency key y registro de auditoría.
- Políticas de abuso/cuotas y recuperación administrativa con doble validación donde proceda; no exigir HSM ni consenso multirregión para una beta sin evidencia de necesidad.
- Diseñar expiración de permisos offline y mensaje al usuario: revocación online eficaz en la próxima operación online, no instantánea de datos ya descargados.
- Si más adelante se monetiza, resolver facturación, impuestos, privacidad, devoluciones y webhook idempotente en una fase **separada y aprobada**. No implantar pagos en esta ronda.

**Go/no-go:** ninguna acción sensible se acepta usando solo valores del cliente.

### Etapa 4 — Vercel preview y prueba física (autorización expresa)
- Despliegue Vite SPA en proyecto RutaCAP aislado; revisión de rutas profundas `/auth/callback`, `base` bajo dominio raíz, configuración de redirecciones y que no haya secretos de servidor en assets.
- Comprobar cachés PWA, actualización del service worker, cambios de versión, modo avión, login/logout en dispositivos reales, errores de red y restauración de datos locales.
- Lanzar beta por invitación, monitorizar fallos y habilitar solo funciones verificadas; producción/comercialización sujetas a una nueva decisión.

**Go/no-go:** controles de privacidad, seguridad, accesibilidad, datos y recuperación probados en servicios reales y móvil físico.

## 5. Opciones deliberadamente descartadas o pospuestas

- No migrar RutaCAP a Next.js solo para usar Vercel.
- No ejecutar los testigos C47–C50 como arquitectura productiva.
- No construir API completa propia si RLS + backend de funciones limitadas cubren los requisitos.
- No prometer protección criptográfica de material que reside en una PWA completamente offline.
- No añadir scoring, IA generativa, suscripción, importador nacional automatizado ni rediseño UI en esta etapa.
- No ejecutar cientos de regresiones sintéticas de nuevo hasta cambiar el área que justificaba esas pruebas.

## 6. Decisiones abiertas que sí cambian producto/coste

1. ¿Qué experiencia es gratuita y qué valor real, verificable y lícito ofrecerá el plan comercial?
2. ¿Se sincronizarán todas las respuestas detalladas o solo el progreso deseado expresamente por el alumno?
3. ¿Cuántos dispositivos por cuenta, cómo se revocan y qué caducidad offline se acepta?
4. ¿Quién puede operar una recuperación administrativa y cómo se audita?
5. ¿Qué fuentes oficiales o licencias permiten distribuir exámenes históricos y cobertura por comunidad?
6. ¿Qué coste y nivel de soporte puede sostenerse con el número de usuarios reales?

Estas preguntas **no bloquean la documentación**; sí son puertas antes de activar un servicio.

## 7. Referencias y comprobaciones

- Código comprobado en `src/supabase.ts`: OAuth de desarrollo limitado a localhost:5173, `cloudConfigured=false`, sesión PKCE y URL de desarrollo aislada.
- `package.json`: Vite/React/TypeScript/Supabase con dependencias `latest`; no fijar nuevas versiones sin validación.
- `docs/commercial/C22_DEV_AUTH_AND_GUEST.md`, `C28_CLOUD_PERSISTENCE_DESIGN.md`, `C29_OFFLINE_SYNC_DESIGN.md`, `C31_FULL_BACKUP_RECOVERY.md`, `C50_TRUST_BOUNDARY_DECISION.md`.
- Documentación oficial consultada: https://supabase.com/docs/guides/api/securing-your-api ; https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/functions/auth ; https://vercel.com/docs/frameworks/frontend/vite .
- Contrato para la siguiente ronda: **implementación autorizada y útil, no más testigos simulados**. Si no hay autorización de servicios, limitarse a higiene/planificación de repositorio.

**Sin pruebas CI específicas:** este cambio es únicamente Markdown y no modifica código ejecutable. Mantener las últimas pruebas C49/C50 como evidencia histórica, no atribuirles validación de arquitectura real.
