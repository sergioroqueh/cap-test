# RutaCAP R88 — acceso persistente y opción de contraseña

## Incidencia resuelta en código
La prueba real R87 validó correo OTP, nueva cuenta y sesión Supabase, pero el usuario observó que después de **Cerrar sesión** debía solicitar un nuevo OTP. Esto no es un fallo: la sesión se revoca intencionadamente. Cerrar únicamente la pestaña conserva la sesión autenticada gracias a `persistSession:true` y `autoRefreshToken:true`.

R88 añade un acceso alternativo opcional con correo+contraseña. No cambia el flujo de alta: cada correo se verifica primero mediante OTP. Una vez dentro, el alumno puede establecer contraseña desde **Mi perfil → Seguridad de la cuenta** y utilizarla posteriormente para identificarse, o seguir con OTP si lo prefiere. Google permanece como proveedor independiente no habilitado en la prueba local.

## Seguridad e implementación
- Nuevo gate de frontend `VITE_RUTACAP_PASSWORD_AUTH=true`, aislado por `authConfigured`; en GitHub Actions variable `RUTACAP_PASSWORD_AUTH`.
- `signInWithPassword` llama a Supabase Auth y valida la sesión devuelta. `setAccountPassword` solo funciona en cuenta autenticada con email confirmado; exige mínimo 8 y máximo 128 caracteres y delega el hash a Supabase Auth mediante `updateUser({ password })`.
- Dos campos con confirmación en «Mi perfil»; no guardar contraseñas en IndexedDB, localStorage, GitHub ni logs. No enviarlas al chat.
- El inicio con OTP mantiene el mismo formulario, el mismo código de seis cifras y los controles R87. El OTP sigue siendo alternativa al olvido de contraseña.
- El cambio o establecimiento de contraseña exige sesión autenticada, pero su seguridad final depende también de las opciones de reautenticación de Supabase, los límites de intentos y la política del servidor. Antes del lanzamiento público, revisar **Secure password change**, reautenticación al cambiar contraseña y configuración mínima de contraseña ≥8 en Supabase; el panel Pro puede requerir plan de pago para filtración de contraseñas.
- El modo de pruebas localhost habilita `VITE_RUTACAP_PASSWORD_AUTH=true` sin alterar Google, pagos, cloudConfigured=false, dominio público, VPS, R80 ni Auth del proyecto no relacionado.

## Prueba humana requerida
1. En `feat/rutacap-commerce-sprint-20261123`, detener Vite con Ctrl+C, actualizar la rama (`git pull --ff-only`) y arrancar `node scripts/r87_otp_local.mjs`.
2. Entrar mediante OTP con el mismo correo que ya se verificó.
3. En **Mi perfil**, establecer una contraseña larga y distinta a las demás; no copiarla al chat.
4. Cerrar sesión. En el formulario inicial pulsar **Entrar con contraseña**, introducir correo y contraseña y comprobar que recupera el mismo usuario.
5. Cerrar la pestaña sin pulsar Cerrar sesión. Volver a abrir y comprobar que la sesión se conserva. Después cerrar sesión y, para comprobar recuperación, utilizar OTP en vez de contraseña.
6. Desactivar **Allow new users to sign up** una vez terminada la prueba si seguía activa. El acceso de cuentas existentes puede permanecer disponible.

## Puertas pendientes
- Confirmar pruebas manuales reales de contraseña, recuperación y sesión; CI de código no sustituye esa prueba.
- Ninguna migración SQL nueva, ningún deploy, ninguna activación Stripe TEST/LIVE ni pago. Persisten cuotas no aplicadas, sincronización desactivada, JSON público y revisión de derechos/licencias y textos de consumidores.

Referencias: https://supabase.com/docs/guides/auth/passwords ; https://supabase.com/docs/guides/auth/sessions ; https://supabase.com/docs/guides/auth/password-security
