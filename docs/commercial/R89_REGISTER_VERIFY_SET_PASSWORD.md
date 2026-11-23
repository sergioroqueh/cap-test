# R89 — Alta convencional: OTP → crear contraseña → estudiar
Fecha: 24/11/2026. Rama aislada `feat/rutacap-commerce-sprint-20261123`.

## Flujo de alumnos
1. En portada: pestaña **Entrar** (correo + contraseña) por defecto y **Crear cuenta o recuperar acceso** (correo + OTP). Invitado permanece separado.
2. Primera vez: el usuario solicita código OTP a su correo. Se mantiene el SMTP RutaCAP y la plantilla `{{ .Token }}` de 6 cifras (Confirm sign up y Magic Link or OTP).
3. Tras `verifyOtp({email,token,type:'email'})`, Supabase valida el correo y autentica. **Antes de mostrar RutaCAP**, se enseña la pantalla «Crea tu contraseña»; el alumno la escribe dos veces y selecciona «Crear contraseña y entrar».
4. La API `auth.updateUser({password,data})` establece la contraseña y almacena en `user_metadata.rutacap_password_ready_v1` el hecho de que la interfaz de configuración se completó. NO guardar ni enviar la contraseña en la aplicación, logs o chat.
5. Inicio normal posterior: correo + contraseña. Si olvida la contraseña, entra con OTP, abre Mi perfil y puede establecer otra.
6. Al cerrar solo la pestaña, la sesión `persistSession:true` se conserva. Si el usuario pulsa «Cerrar sesión», la sesión se invalida y debe identificarse de nuevo.
7. Usuarios de R88 con contraseña ya creada, pero sin el nuevo marcador: podrán seleccionar «Ya tenía una contraseña · Continuar» después de verificar su correo, y marcarse como configurados. Un inicio válido con contraseña también actualiza ese marcador sin pedir una nueva.
8. Google se sigue gobernando por su variable independiente; un usuario cuya identidad principal es Google no está obligado a establecer una contraseña.

## Seguridad y alcance
- `user_metadata` es **editable por el usuario**: es un indicador exclusivamente visual de onboarding. No se utiliza para controlar cuotas, roles, acceso Premium ni autorización RLS.
- La contraseña exige al menos 8 caracteres en el formulario. Es aconsejable configurar en Supabase Auth un mínimo de 8 caracteres también en el servidor antes de publicar (ahora la configuración observada permitía menos).
- Los requisitos de reautenticación para cambios de contraseña, la recuperación de cuenta y los límites de intentos se revisarán antes de lanzamiento público.
- El acceso por OTP sigue disponible para recuperar acceso; las plantillas de Signup y Magic Link deben conservar el mismo código de 6 cifras. Nunca mostrar OTPs en capturas públicas.
- No modifica los usuarios, las tablas de Supabase, planes, Stripe, el VPS, Vercel, DNS ni R80. `cloudConfigured=false`.
- Se usa `updateUser()` de Supabase Auth, en el proyecto `rutacap-dev` al probar manualmente, solo después de un correo verificado.

## Prueba real R89 local (no prod)
1. Parar Vite con `Ctrl+C`, actualizar rama `git pull --ff-only` y volver a ejecutar `node scripts/r87_otp_local.mjs`.
2. Dejar el alta de nuevas cuentas desactivada si ya la cerraste. **No es necesario crear otro usuario para comprobar R89**: con el usuario existente de R88, cierra sesión y entra con contraseña; la cuenta debe seguir funcionando normalmente. O entra por OTP y pulsa «Ya tenía una contraseña · Continuar» si te aparece el paso de configuración.
3. Para verificar el flujo completo de *nuevo alumno*, activar el alta brevemente solo si se autoriza esa prueba; usar otro correo de prueba controlado, solicitar OTP, verificar, observar pantalla de contraseña, guardarla y acceder. Desactivar alta después.
4. Cerrar sesión y entrar con correo y contraseña sin OTP. Comprobar que la identidad y el progreso local continúan separados por el mismo UUID.
5. Volver a abrir la pestaña sin cerrar sesión para comprobar persistencia. No subir contraseñas ni códigos a capturas/chat.

## Puertas pendientes
CI valida código y flujo guest de Chromium, **no sustituye las pruebas reales de alta, metadata Auth y Google**. La cuenta Premium aún no es comercial: cuotas sin enforcement, JSON públicos, sincronización cloud cerrada, Stripe LIVE apagado, derechos y contratos sin cerrar.

Referencias: https://supabase.com/docs/guides/auth/auth-email-passwordless , https://supabase.com/docs/reference/javascript/auth-updateuser , https://supabase.com/docs/guides/auth/sessions
