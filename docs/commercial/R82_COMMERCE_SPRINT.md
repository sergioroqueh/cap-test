# RutaCAP R82 — Sprint comercial aislado (23/11/2026)
## Qué se ha preparado
Rama `feat/rutacap-commerce-sprint-20261123`, origen congelado R80 `6864b95653a60fa0de9e39dfc2be81133be9a89a`. Ninguna activación, migración, integración de pago real, cambio de DNS ni modificación de contenido CAP.
- `src/supabase.ts`: OAuth/OTP de nuevos usuarios solo con bandera `VITE_RUTACAP_PUBLIC_AUTH=true`, modo lanzamiento, dominio exacto `https://rutacap.es`, URL Supabase aislada actual y publishable key. El callback sigue siendo `/auth/callback`. Configuración ausente = invitado. Se mantiene `cloudConfigured=false`.
- `src/CommercialAccountPreview.tsx` + `App.tsx`: acceso con cuenta habilitable y panel de plan. No se garantiza progreso multidispositivo; sigue local hasta aprobar adaptador de sincronización.
- `src/commercialBilling.ts` + `CommercialBillingPanel.tsx`: estado consultado en base de datos RLS. No se pueden activar derechos Premium mediante localStorage ni valores de la UI. Botones de Stripe solo si `VITE_RUTACAP_BILLING_ENABLED=true`.
- `docs/commercial/sql/R82_BILLING_DRAFT.sql`: nuevos clientes, suscripciones, recibos idempotentes, políticas de planes. **Borrador no aplicado**. Ninguna tabla de facturación existía antes de este sprint.
- `supabase/functions/rutacap-billing/index.ts`: acciones checkout/portal requieren token verificado contra Supabase Auth; el usuario y el precio se derivan en servidor. Webhook sin JWT de transporte pero con verificación HMAC Stripe-Signature con tolerancia 5 minutos, cotejo de modo test/live, idempotencia y consulta del estado actual de Stripe antes de escribir el acceso. Con clave `sk_live_` exige `RUTACAP_LIVE_BILLING=approved`.
- `supabase/config.toml`: `verify_jwt=false` exclusivamente para `rutacap-billing` por el webhook; autenticación de usuario es manual en función, firma exigida para webhook.
- `launch-beta.yml`: valores de build desde variables no secretas de GitHub, workflow manualizable sobre rama aislada. No publicar ni desplegar automáticamente.
- `scripts/test_commercial_sprint_r82.mjs`: comprobaciones estáticas de fronteras. **No sustituyen** prueba Stripe/test de API y JWT real.

## Límites propuestos — NO ENFORCED en R82
**Tres planes exclusivamente:** Invitado (25 preguntas/1 examen por día), Gratis (100 preguntas/3 exámenes por día) y Premium (sin cuotas de producto). La palabra beta designa la fase de lanzamiento, nunca un nivel de acceso. Durante promociones de lanzamiento se pueden modificar temporalmente las cuotas del plan Gratis mediante la política del servidor, sin inventar un cuarto plan. `rc_access_policies` es una configuración de **borrador**, no existe un backend de consumo diario. Los JSON `/data` siguen públicos en R80: ocultar botones, cuotas en navegador o mostrar Premium no restringe su descarga. NO activar el bloqueo comercial de corpus estático sin migrar a entrega controlada por servidor, con licencias comprobadas y pruebas de no filtración. No vender acceso exclusivo a esos mismos archivos abiertos.

## Activación técnica (orden de ejecución; ninguna realizada)
1. Resolver los permisos de uso de bancos y exámenes y finalizar aviso legal, privacidad, cookies y condiciones comerciales; alta fiscal apropiada antes de cobros reales.
2. Configurar Auth en el proyecto aislado RutaCAP: Google OAuth callbacks (Google Cloud -> `https://rhtbqetskghkarxhrgee.supabase.co/auth/v1/callback`; Supabase Site URL `https://rutacap.es`; Redirect URL `https://rutacap.es/auth/callback`). Habilitar creación de nuevos usuarios; probar nueva cuenta A/B, cierre de sesión, recuperación. Probar límites reales de envío de correo/SMTP.
3. Resolver Security Advisors de `rls_auto_enable` sobre el proyecto RutaCAP con autorización, verificar que el trigger mantiene protección, comprobar RLS y controles A/B reales. **No usar proyectos Supabase de CuadernoTécnico/PROSOEL.**
4. Revisar SQL R82; tras autorización específica, aplicar al proyecto RutaCAP, inspeccionar grants, tablas, advisors, aislamiento A/B, acceso anónimo, INSERT/UPDATE denegados. Usar cambios de esquema versionados.
5. Abrir una cuenta Stripe del titular con sus requisitos de identidad y datos fiscales; crear precio recurrente y Billing Portal en **modo test**. Guardar `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, `STRIPE_PRICE_ID=price_...` SOLO como secretos de Edge Functions. No enviarlos por chat/GitHub. Ajustar endpoint webhook a `https://<ref>.supabase.co/functions/v1/rutacap-billing/webhook`, seleccionar eventos de suscripción y Checkout. Mantener en modo TEST.
6. Desplegar Edge Function con el verificador de firma. Probar una sesión Checkout en test, evento confirmado, reflejo en `rc_billing_subscriptions`, cambio a cancelado, idempotencia de webhook, acceso usuario B no autorizado, portal, fallos de firma, renovación y 403/401.
7. Comprobar la integración UI con la nueva compilación CI única, sin cambios a R80 productiva todavía. Variables públicas del workflow para primer lanzamiento con cuentas: `RUTACAP_PUBLIC_AUTH=true`, `RUTACAP_SUPABASE_URL=https://rhtbqetskghkarxhrgee.supabase.co/`, `RUTACAP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`. `RUTACAP_BILLING_ENABLED` debe permanecer vacío/false hasta que el backend y los términos estén listos. No confundir variable pública con secreto. Si se utiliza una rama distinta, ejecutar manualmente workflow_dispatch seleccionando esa referencia.
8. Solo después de aceptación final, activar dominio público + Caddy mediante runbook R78 y despliegue único. Conservar beta protegida y release R80 para rollback.
9. Para pasar de Stripe TEST a LIVE: completar obligaciones de empresa/autónomo, exponer precio completo por período, impuestos, renovación automática, cancelación, desistimiento e información contractual; configurar claves live e id `price_` correctos, webhook live distinto, habilitar `RUTACAP_LIVE_BILLING=approved` y variable pública de billing, probar pago real de bajo importe controlado.

## Bloqueantes reales para "comercial cerrado"
- Sin cuenta Stripe conectada ni parámetros reales no hay cobro que habilitar.
- Sin entrega autenticada de JSON no hay cuotas verificables para banco/exámenes. No mostrar cuotas como restricciones efectivas en la interfaz hasta tener enforcement server-side.
- `cloudConfigured=false`, adaptación del progreso entre dispositivos todavía no aprobada.
- Sin derechos acreditados no se puede publicar ni comercializar automáticamente el corpus R80 íntegro.
- Los textos legales actuales dicen que la beta no usa cuentas/pagos; deben actualizarse cuando se habiliten efectivamente.
- Registro/cobro productivo exige que el titular gestione su información legal y fiscal sin publicar esos datos en el repositorio.

## Invariantes
No cambiar scoring, respuestas, frecuencias, 62 JSON, SW, R80 publicada, `main`, PR #21 ni Vercel. Agrupar ajustes en un único commit de rama de sprint y un solo build manual cuando esté listo; no disparar Actions por retoques.
