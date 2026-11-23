# RutaCAP R84 — verificación de activación comercial (23/11/2026)

## Alcance real
R84 es una mejora de seguridad y pruebas del código en la rama comercial, NO un servicio de cobro activado. Se mantiene R80 en beta protegida, main, PR #21 y Vercel sin cambios. No se han aplicado migraciones ni ejecutado Stripe real.

## Decisiones congeladas
- Solo planes Invitado, Gratis y Premium. Beta describe el lanzamiento, no un nivel comercial.
- Cuotas propuestas sin aplicación real: Invitado 25 preguntas y 1 examen al día; Gratis 100/3; Premium sin límite de producto. Queda pendiente backend autoritativo de consumos y entrega protegida de preguntas, no simulación en JS.
- El banco R80 publica JSON descargables. Una cuenta Premium no puede venderse como acceso exclusivo a esos mismos JSON sin cambiar la distribución de contenido.
- cloudConfigured=false continúa sin sincronizar progreso. No activar sincronización heredada ni afirmar que una cuenta sincroniza entre dispositivos.

## Comprobaciones del proyecto aislado de Supabase (solo lectura)
- Proyecto rutacap-dev ref rhtbqetskghkarxhrgee.
- 1 usuario Auth ya existente; 0 perfiles, 0 preguntas de progreso y 0 sesiones almacenadas.
- public.rls_auto_enable() sigue siendo SECURITY DEFINER invocable por anon y authenticated; el event trigger ensure_rls permanece activo. Revocar EXECUTE tras autorización específica, y verificar advisors y trigger.
- R82 schema probado solo transaccionalmente con BEGIN/ROLLBACK, tres planes y grants: sin persistencia.

## R84 endurecimiento del flujo Stripe
- Edge Function solo crea cliente de administración contra el proyecto Supabase aislado de RutaCAP.
- El webhook sincroniza únicamente suscripciones del STRIPE_PRICE_ID previsto; otras suscripciones del cliente no conceden Premium.
- Para una suscripción ya activa no se revoca el estado por un Checkout incompleto paralelo.
- Se comprueba Stripe (listado actual) antes de crear otra sesión Checkout para reducir riesgo de duplicar suscripciones. Las solicitudes repetidas durante diez minutos reutilizan una clave de idempotencia Stripe derivada del usuario y tramo de tiempo; consultar Stripe sigue siendo necesario porque una sesión podría completarse entre solicitudes.
- El webhook reconoce altas/actualizaciones/bajas, Checkout completado, Checkout asíncrono confirmado e invoice.paid. Consulta la suscripción actual al procesar el evento, evitando dar acceso por una mera redirección de éxito.
- Verificación HMAC de Stripe, ventana de tolerancia, modo test/live y recibos de eventos persistidos, sin publicar secretos.
- scripts/test_r84_billing_runtime.mjs añade pruebas de integración sintéticas mediante Node + compilación TypeScript en memoria, dobles de Stripe y Supabase, sin conexiones externas; deben ejecutarse en una única CI antes de declarar PASS. Se añadió el paso al workflow manual de compilación, sin ejecutar Actions todavía.

## Imprescindible antes de activar cobros
1. Autorización expresa del propietario para aplicar docs/commercial/sql/R82_BILLING_DRAFT.sql exclusivamente en rutacap-dev y revocar permisos públicos de la función RLS. No se autoriza por el mero hecho de continuar el sprint.
2. Completar Google OAuth y Email OTP/plantilla en Supabase Dashboard. Comprobar cuentas A/B, redirecciones, sesiones y correo real. El usuario no necesita proporcionar secretos al chat.
3. Conectar Stripe del titular; en TEST crear precio recurrente, habilitar Portal, configurar Edge Function en Supabase con sk_test_, whsec_, ID de precio y webhook. Guardar credenciales únicamente en el gestor de secretos de Supabase.
4. Probar Checkout real en TEST con pago sintético en Stripe, webhook válido/inválido, duplicado, cancelación, renovación, acceso entre A/B y modo expirado.
5. Implementar cuota en backend y suministro protegido del corpus Premium, revisar licencias y privacidad/legal en régimen de usuarios registrados y suscripciones.
6. Solamente cuando esos resultados estén documentados, decidir activar registro público y pagos reales con datos fiscales/condiciones adecuadas y una única compilación/deploy aprobado.

## Comprobaciones útiles que NO sustituyen el gate
- Los tests sintéticos prueban la función con dobles, no verifican entrega real de webhooks de Stripe, ni impuestos, ni funcionamiento de Supabase Auth / RLS.
- La interfaz premium consulta una tabla con RLS y periodo de suscripción futuro. Las cuotas siguen sin enforcement.
- No invocar GitHub Actions por retoques. Una única CI manual de launch-beta.yml en la rama comercial tras cerrar los cambios.

## Referencias
Stripe - periodo por ítem: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
Supabase - webhook firmado: https://supabase.com/docs/guides/functions/examples/stripe-webhooks
Supabase - acceso por correo: https://supabase.com/docs/guides/auth/auth-email-passwordless
