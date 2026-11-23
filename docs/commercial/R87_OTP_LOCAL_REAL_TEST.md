# RutaCAP R87 — prueba real de registro OTP solo en localhost

**Objetivo:** probar registro nuevo por correo, recepción del código, sesión y cierre; sin desplegar R80, sin activar Stripe LIVE ni sincronización. Proyecto único: `rutacap-dev` (`rhtbqetskghkarxhrgee`). Los planes siguen siendo Invitado, Gratis y Premium.

## Antes de iniciar (Supabase)
- Authentication > Sign In / Providers > Email: `Enable email provider` y `Enable magic links and email OTP` en ON.
- `Email OTP length = 6` y `Email OTP expiration = 900` segundos. Guardar.
- Email Template > Magic Link or OTP: plantilla con `{{ .Token }}` y asunto «Tu código de acceso a RutaCAP» guardados. SMTP externo configurado.
- URL Configuration: Site URL `https://rutacap.es`; redirect permitido `http://localhost:5173/auth/callback`.
- Para probar **alta nueva**, poner temporalmente `Allow new users to sign up = ON` y guardar. **IMPORTANTE:** el cambio es global en ese proyecto Supabase y no se limita a localhost; volver a OFF inmediatamente tras la prueba.

## Arranque Windows PowerShell
Si aún no tienes la rama comercial en tu ordenador:

```powershell
git clone --depth 1 --single-branch --branch feat/rutacap-commerce-sprint-20261123 https://github.com/sergioroqueh/cap-test.git RutaCAP-OTP
cd RutaCAP-OTP
npm ci
node scripts/r87_otp_local.mjs
```

Si ya tienes esa rama, actualízala en su propia carpeta en lugar de clonar una segunda vez.

El script comprueba rama compatible, exige la **clave pública** `sb_publishable_...` de Supabase > API Keys, y utiliza variables **solo en memoria para el proceso**. No introducir `service_role`, `sb_secret_`, claves de Stripe ni la contraseña SMTP. No almacenar ni enviar esas claves por el chat.

El script genera datos públicos y sirve la aplicación en **http://localhost:5173**. Funciona únicamente en 127.0.0.1:5173, sin elegir un puerto alternativo. `VITE_RUTACAP_AUTH_DEV=true`, `VITE_RUTACAP_DEV_SIGNUPS=true`, `VITE_RUTACAP_EMAIL_OTP=true`; Google, pago real, auth pública y sincronización desactivados.

## Comprobación humana A
1. Abrir **http://localhost:5173** en el mismo PC.
2. Introducir una dirección de correo que controles y que NO esté en Authentication > Users, para probar alta nueva.
3. Solicitar un OTP una sola vez. Revisar bandeja, spam y la plantilla con seis números. Nunca compartir códigos OTP.
4. Copiar el código al formulario de RutaCAP; comprobar que accedes y que en Mi perfil se ve tu correo y «Cuenta gratuita». El progreso aún es solo local.
5. Cerrar sesión, volver a entrar con un OTP nuevo y verificar la sesión. Confirmar que el nuevo usuario existe en Authentication > Users.
6. Volver a poner `Allow new users to sign up = OFF` y guardar. Pulsar Ctrl+C en PowerShell para detener Vite.

Errores en modo DEV se muestran en pantalla solo para el diagnóstico local; no se mostrarán en la compilación comercial. Si falla el correo, comunicar exclusivamente el texto del error, sin direcciones privadas ni códigos. Una prueba A superada no equivale a prueba A/B, RLS del contenido, autorización de derechos o pagos efectivos.

## Invariantes
R80 en VPS, main, PR #21 y Vercel intactos. No hay alta de autónomo por ejecutar el servidor local; no habilitar Stripe LIVE. Backend de cuotas y JSON protegidos todavía pendiente. No tocar los datos de examen ni tablas de Supabase para este paso.
