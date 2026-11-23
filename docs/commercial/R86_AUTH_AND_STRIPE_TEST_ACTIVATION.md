# RutaCAP — R86 | Puesta en marcha Auth y Stripe TEST (23/11/2026)

**Proyecto exclusivo**: Supabase `rutacap-dev`, ID `rhtbqetskghkarxhrgee`. No tocar CuadernoTécnico, PROSOEL, DNS, Caddy, VPS ni datos CAP. R80 privada intacta. **Únicos planes**: `guest`, `free`, `premium`.

## Verificado mediante acceso de lectura
- Proyecto Supabase activo con una **publishable key** moderna habilitada (`sb_publishable_...`). No copiar ni registrar credenciales completas.
- **0 Edge Functions desplegadas**. No es posible probar Checkout real hasta desplegar la función y configurar Stripe TEST.
- R85: tablas y RLS instaladas, niveles 25/1, 100/3 y Premium sin cuota; todavía no se aplica ningún límite ni se protege la distribución de JSON. `cloudConfigured=false`.
- Este conector permite consultar base de datos, desplegar Edge Functions y leer estado, pero **no administra la configuración Auth** (Google, SMTP, plantillas, Redirect URL) ni la cuenta Stripe del titular. Esas acciones deben efectuarse en los respectivos paneles.

## 1. Configurar URL/Auth en Supabase, sin secretos en GitHub
- URL Configuration: https://supabase.com/dashboard/project/rhtbqetskghkarxhrgee/auth/url-configuration
- **Site URL:** `https://rutacap.es`.
- **Redirect URLs** permitidas: `https://rutacap.es/auth/callback`; solo durante pruebas locales, añadir `http://localhost:5173/auth/callback`. No añadir comodines amplios ni hosts ajenos.
- El código realiza `signInWithOAuth({provider:'google', redirectTo: callbackUrl()})`, usa PKCE y `getUser()` para verificar la sesión. No hay sincronización remota todavía.
- Antes de abrir registro público, actualizar política de privacidad y términos para reflejar Supabase Auth, proveedores, identificadores, emails, borrado de cuentas, retención y tratamiento real. Habilitar el registro solo con canales de acceso probados.

## 2. Google OAuth
- Abrir https://console.cloud.google.com/auth/overview; configurar pantalla de consentimiento, público objetivo y usuarios de prueba según corresponda, scopes `openid`, `userinfo.email`, `userinfo.profile`.
- Crear **OAuth Client ID de aplicación web**. URL de redirección autorizada EN GOOGLE: `https://rhtbqetskghkarxhrgee.supabase.co/auth/v1/callback` (no confundir con la vuelta a nuestra SPA).
- Abrir el proveedor Google en Supabase Authentication > Sign in / Providers: https://supabase.com/dashboard/project/rhtbqetskghkarxhrgee/auth/providers. Activarlo y guardar Client ID/Client Secret **directamente allí**, nunca en chat ni GitHub.
- Google puede requerir configuración/validación de branding y audiencia; si Google no admite aún público general, mantenerlo desactivado en RutaCAP y permitir acceso solo con un método correctamente probado.
- Bandera de FRONTEND: `VITE_RUTACAP_GOOGLE_AUTH=true` solo **después** de confirmar el proveedor; en GitHub Actions se toma de la variable no secreta `RUTACAP_GOOGLE_AUTH`. No exponer el botón si la bandera está vacía.

## 3. Inicio con correo de seis dígitos (recomendado como vía de lanzamiento)
- Supabase Authentication > Providers: permitir Email OTP y nuevos registros, configurar un SMTP propio verificado y los límites de envíos aptos para alumnos; el servicio de correo de cortesía Supabase puede imponer restricciones de destinatarios y volumen.
- Authentication > Email Templates > Magic Link: reemplazar la plantilla del acceso por correo para mostrar **`{{ .Token }}`** (código numérico), en lugar de proporcionar exclusivamente el enlace `{{ .ConfirmationURL }}`.
- Ejemplo de cuerpo:
```html
<h2>RutaCAP · Código de acceso</h2>
<p>Tu código de seis cifras es <strong>{{ .Token }}</strong>.</p>
<p>Es de un solo uso y caduca. No lo compartas.</p>
```
- Código: `signInWithOtp({ email, shouldCreateUser: publicAuth || devSignupConfigured })` seguido por `verifyOtp({email,token,type:'email'})`.
- Bandera pública `VITE_RUTACAP_EMAIL_OTP=true` / GitHub variable `RUTACAP_EMAIL_OTP` solo tras recibir y validar códigos en A y B.
- Para pruebas en localhost se puede añadir `VITE_RUTACAP_DEV_SIGNUPS=true` **solo en entorno DEV**, con acceso restringido a la máquina. La bandera está desactivada por defecto y no se propaga al build comercial.

## 4. Pruebas de usuarios A/B (pendientes de configuración real)
Con dos correos de prueba bajo control de quien valida:
- Alta de A y B por correo, errores y caducidad OTP, acceso desde PC/móvil, logout e inicio de sesión cruzado.
- Verificar `getUser()`/sesión y aislamiento de progreso local por UUID.
- Consulta RLS: A no debe leer la suscripción de B y ninguno puede insertar/editar su nivel Premium. Una prueba sin usuarios y tokens auténticos **no** valida esta puerta.
- Sincronización en nube sigue desactivada hasta un adaptador con consentimiento revocable y pruebas A/B. No prometerla como prestación existente.

## 5. Stripe TEST: preparación, no cobro real
- Crear/abrir cuenta Stripe del titular y entrar en un **sandbox/test mode**. Se necesita un producto RutaCAP Premium y precio recurrente explícito. Completar el Portal de Clientes.
- El backend disponible es `supabase/functions/rutacap-billing/index.ts`. Endpoint tras desplegar en desarrollo: `https://rhtbqetskghkarxhrgee.supabase.co/functions/v1/rutacap-billing`; webhook: añadir `/webhook`.
- Configurar en **Supabase Edge Function secrets**, nunca en VITE/GitHub/chat: `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, `STRIPE_PRICE_ID=price_...`. El proyecto proporciona su propia configuración server-only `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
- Despliegue de la función `rutacap-billing` con `verify_jwt=false` **solo por transporte del webhook**; el código exige firma de Stripe en `/webhook` y verifica JWT mediante Supabase Auth en Checkout/Portal.
- Eventos mínimos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`. Confirmar comportamiento de renovación, cancelación y pagos no cobrados.
- **Nunca** establecer `RUTACAP_LIVE_BILLING=approved` ni usar `sk_live_` hasta autorización independiente, obligaciones fiscales/condiciones completas y contenidos con derechos aclarados.
- No desplegar Edge Function sin un circuito real de pruebas y secretos preparados; sin ellos devolvería 503 y no validaría la integración.

## 6. CI agrupada y despliegue
- La rama `feat/rutacap-commerce-sprint-20261123` se añade **solo ahora** al filtro de `push` de `.github/workflows/launch-beta.yml` para provocar una ejecución CI con test de contratos, test de Stripe simulado, `tsc`, build launch y un primer recorrido Chromium.
- El workflow **no despliega**: únicamente guarda un ZIP durante siete días. No tocar VPS/beta y no activar Auth pública todavía.
- La prueba CI corre sin contraseñas ni claves privadas de Stripe; no demuestra que Google, SMTP, webhook real ni renovación funcionen en proveedores.
- Las banderas de build sensibles a la puesta en marcha se quedan desactivadas hasta su integración validada.

## Gate legal y de producto
No comercializar cuotas de 25/100 como límites efectivos cuando el mismo banco se descarga en `/data/*.json`. No vender PDFs, datos o exámenes como exclusivos de Premium mientras los archivos sean accesibles sin verificación. Revisar derechos y términos del corpus, política de privacidad, retención, consumidores, precio/impuestos, renovación, cancelación y el tratamiento de datos de registro. **Beta no es un plan**.

## Referencias oficiales
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/api/securing-your-api
- https://docs.stripe.com/payments/existing-customers
- https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
