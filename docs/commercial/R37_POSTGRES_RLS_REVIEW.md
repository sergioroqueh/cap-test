# R37 — SQL/RLS para lectura consistente (18/11/2026)

**Estado: solo propuesta, no migración ni despliegue.** PR #21 `feat/cap-commercial`, `cloudConfigured=false`.

## Evidencia nueva del usuario
La vista previa de la copia personal `rutacap-copia-local-2026-11-18 (2).json` mostró 98 preguntas, 1 sesión y 98 operaciones; selección del JSON aceptada sin restauración. El usuario confirmó funcionamiento. **No prueba una restauración destructiva o la subida a nube**. R36 también fue validada en Windows (2/2 PASS, cero peticiones cloud).

## Diseño adoptado
Usar la **función SQL de lectura `security invoker`**, `public.rc_read_consistent_snapshot_v1()`, definida únicamente como draft en `docs/commercial/sql/R37_consistent_snapshot_review.sql`.

- La función **no acepta `user_id` como parámetro**: deriva el propietario de `auth.uid()`; exige `is_anonymous=false` y `authenticated` para EXECUTE.
- Lee `public.rc_progress_events` (C29) y `public.rc_study_sessions` (C28) en **una sola sentencia SELECT**, con CTE materializados. En PostgreSQL, las subconsultas de la misma sentencia comparten la instantánea MVCC de la consulta; `STABLE` evita nuevas instantáneas internas volátiles. RLS actúa con los permisos del llamante (`SECURITY INVOKER`).
- Aplica límite explícito: máximo 5.000 registros por recurso, **NULL si hay exceso**, nunca truncar silenciosamente. Es un tope de seguridad temporal **no dimensionado aún para un usuario comercial**: diseñar paginación transaccional escalable antes de activar el servicio.
- Devuelve JSON de eventos y sesiones íntegros, con `userId` para verificar dueño también en el endpoint R36. El endpoint aún debe exigir JWT validado, consentimiento persistido/revocable, cuota, tamaños y captura de errores. Una llamada RPC aislada **no** permite suponer que se verificó todo ese contexto.
- La función no hace mutaciones, no usa `SECURITY DEFINER`, no tiene permisos anon ni `service_role` en cliente. El `service_role` no se necesita para esta ruta.
- Las tablas base C28/C29 son borradores NO aplicados, con políticas RLS, grants y validaciones susceptibles a endurecimiento. R37 no altera C28/C29: no hay migración lista para producción.

## Prueba práctica que agrega valor
`scripts/r37_disposable_postgres_rls.sql` crea roles de prueba y funciones Auth sustitutas **solo en una base PostgreSQL 16 desechable**; aplica allí C28, C29 y la función R37 y comprueba:
- A ve su evento y su sesión, no los de B;
- B ve su evento y su sesión, no los de A;
- usuario `authenticated` con claim anónimo o sin sujeto recibe `NULL`, sin filas;
- rol `anon` no puede ejecutar la RPC;
- la función no está marcada como `SECURITY DEFINER`.

El pipeline `.github/workflows/r37-disposable-postgres-rls.yml` instala `psql` y usa un servicio Docker `postgres:16` efímero sin conexión a Supabase. Ejecuta **una única** integración física contra PostgreSQL y verifica `cloudConfigured=false`; no ordena pruebas masivas antiguas.

**Limitación honesta:** las funciones `auth.uid()` / `auth.jwt()` en el fixture se sustentan en claims simulados, **no** en firmas JWT de Supabase. No sustituye un ensayo real de tokens expirados, revocados, ni de endpoint transaccional de producción.

## Hallazgos pendientes antes de pedir aprobación de migración
- Revisar límites de tamaño de datos/cargas, excepciones, contratos exactos JSONB para eventos/sesiones, preservación de historial y proyección del journal.
- Definir autenticación del endpoint y confirmación de consentimiento en servidor. Nunca confiar únicamente en usuario o consentimiento que llegan del navegador.
- Crear una migración formal a través de `supabase migration new` **solo cuando el usuario autorice**; primero revisar el esquema completo y disponer de un proyecto de ensayo aislado.
- Validar RLS con dos cuentas reales A/B sobre RutaCAP, JWT caducado, lectura/escritura sin fuga y advisors.
- Resolver los dos WARN C24 asociados a `public.rls_auto_enable()` con autorización expresa.
- Mantener Vercel Ignored Build Step y PR #21 DRAFT. No activar cloud, desplegar, pagar ni tocar scoring, banco o UI.

## Fuentes técnicas consultadas
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- C28/C29 SQL originales, C51 decisión de arquitectura y R36 contrato de snapshot.

**No ejecutar los SQL de docs/commercial/sql en el proyecto conectado hasta una orden de autorización explícita y concreta.**
