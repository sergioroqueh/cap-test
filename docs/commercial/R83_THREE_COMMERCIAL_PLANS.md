# RutaCAP — R83: tres planes comerciales y condiciones de activación
Fecha: 23/11/2026 · Rama de sprint aislada · SIN despliegues ni migraciones reales

## Decisión vinculante
Los **únicos planes** son:
- `guest` / **Invitado** — sin cuenta, progreso en el dispositivo. Cuotas futuras propuestas: 25 preguntas y 1 examen por día.
- `free` / **Gratis** — cuenta verificada. Cuotas futuras propuestas: 100 preguntas y 3 exámenes por día, sincronización futura sujeta a consentimiento y prueba.
- `premium` / **Premium** — suscripción confirmada en el servidor, sin cuotas comerciales de preguntas/exámenes y funciones avanzadas según licencias.

**Beta NO es un plan ni un privilegio.** La palabra beta se limita al estado público de lanzamiento y los avisos editoriales. No se crea `tier='beta'` ni se usa en permisos, base de datos, lógica de cuentas o perfil. Cualquier promoción temporal durante el lanzamiento consiste en ajustar reglas de `free` mediante política del servidor; no se crea una cuarta categoría ni se cobran automáticamente las cuentas gratis.

## Estado de implementación
- Tipo TS `CommercialTier`, derivación del plan sin pago, presentación en Perfil, constraint SQL y datos iniciales restringidos a tres niveles.
- La etiqueta de portada «versión beta» describe madurez del producto; al iniciar sesión el perfil indica «Cuenta gratuita».
- `rc_access_policies` R82 sigue siendo **borrador SQL**, no migración aplicada. Las cuotas **no se hacen cumplir** aún: `/data/*.json` son archivos estáticos públicos que también pueden descargarse directamente.
- Estado Premium de solo presentación: se exige `active`/`trialing` y `current_period_end` válido y futuro; permiso real sobre contenidos debe comprobarse en backend.
- La redacción de `src/CommercialAccountPreview.tsx` explica la modalidad de acceso sin simular sincronización; cuando el administrador habilite el OTP, el alumno puede introducir el código y validar su cuenta. No se ha activado Auth real en la publicación.

## Validación segura de R83
- Validación local de contenido de 3 planes y ausencia del cuarto nivel en TS, SQL y Perfil.
- En `rutacap-dev`, el SQL R82 revisado se ejecutó en una transacción `BEGIN … ROLLBACK`, con comprobaciones en el interior de la transacción sobre tres planes, cuotas y nulidad Premium. Ninguna tabla de facturación quedó aplicada.
- No se han lanzado GitHub Actions. La primera CI del conjunto debe comprobar el flujo de registro y código TS/React/Edge Function; **las pruebas estáticas no equivalen a E2E ni a Stripe real**.

## Seguridad real necesaria antes de activar cuentas y pagos
1. Supabase Auth: configurar Google con redirect del proyecto y `https://rutacap.es/auth/callback` en URL Configuration; habilitar el alta de nuevos usuarios solo después de completar política de privacidad, seguridad y correos. No utilizar proyectos de otras aplicaciones.
2. **Email OTP:** R83 incorpora un formulario de código de seis dígitos y `supabase.auth.verifyOtp({email,token,type:'email'})`, protegido por la bandera pública `VITE_RUTACAP_EMAIL_OTP=true` (GitHub variable `RUTACAP_EMAIL_OTP`). Hasta que Supabase Auth > Email Templates > Magic Link muestre `{{ .Token }}` en el correo, y se hayan validado entrega/registro/código en móvil, mantener la bandera desactivada. No confundir la plantilla por defecto con el flujo de código. Google OAuth se habilita por separado.
3. Revocar la capacidad de ejecutar `public.rls_auto_enable()` desde `anon` y `authenticated` previa autorización; comprobar que la protección `ensure_rls` continúa funcionando.
4. Validar RLS con dos usuarios reales A/B, y cierre de sesión; activar progreso entre dispositivos solamente al completar el contrato y consentimiento de sincronización. `cloudConfigured=false` se mantiene.
5. Stripe: migración de facturación R82 aprobada, secreto sólo en Edge Function, webhook firmado, pago de prueba, suscripción, portal, cancelación y comprobación de cuenta ajena. Mantener **pagos reales desactivados** hasta derecho de uso del corpus, contratación, fiscalidad y aprobación explícita.

## Invariantes
R80 protegida en VPS; no tocar `main`, PR #21, `feat/cap-commercial`, Vercel, DNS ni archivos de datos. No subir NIF, domicilio, credenciales o tokens. Una única CI manual tras agrupar trabajo relevante, y despliegue manual solo después de aceptación.
