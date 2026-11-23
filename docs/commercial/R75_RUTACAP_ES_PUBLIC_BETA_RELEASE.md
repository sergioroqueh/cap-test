# RutaCAP.es — Preparación de beta pública gratuita
Fecha: 23/11/2026. Objetivo de presentación: jueves 26/11/2026.

## Alcance de autorización
El propietario ha autorizado **PREPARAR** la publicación pública de una beta gratuita.
Esto NO autoriza por sí solo a activar producción, cobrar, migrar el banco,
modificar registros DNS, cambiar nameservers o alterar servicios de correo.
No se ha conectado Cloudflare ni cambiado la configuración de OVHcloud.
No se ha fusionado la PR #21 con main. Mantener intacta la web anterior.

## Estado de artefacto
- Repo: sergioroqueh/cap-test (público).
- Rama de desarrollo: feat/cap-commercial.
- Compilación comercial pública aislada: `npm run build:launch`.
- Entorno `.env.cap-launch`: solo `VITE_CAP_LAUNCH=true`.
- Salida estática: `dist/`, base absoluta `/`, sin Supabase ni pagos.
- Acceso inicial: beta gratuita, continuación invitado con datos locales.
- `_headers` para Cloudflare Pages: no reutilizar índices/SW antiguos en HTTP cache,
  assets Vite con nombres versionados de larga duración; no se compromete el
  comportamiento del service worker sin prueba física.
- GitHub Actions workflow `launch-beta.yml` valida build, archivos mínimos,
  ruta raíz y recorrido en Chromium móvil 390 / desktop 1440, y adjunta `dist`.
- Las pruebas de scoring/banco y el paquete R63 se mantienen sin mutación.
- La Preview de Vercel y GitHub Pages anteriores permanecen independientes.

## Alojamiento candidato: Cloudflare Pages / dominio OVHcloud
Vercel Hobby no permite uso comercial. GitHub Pages tampoco está destinado
a alojar SaaS comerciales. Cloudflare Pages es candidato para la beta, sujeto
a las condiciones actuales de su suscripción y límites del plan gratuito.

**Ruta sin modificar los DNS de correo para probar el alojamiento:**
1. Crear cuenta Cloudflare controlada por el propietario (si no existe).
2. Workers & Pages > Create > Pages > Connect to GitHub.
3. Autorizar únicamente el repositorio `sergioroqueh/cap-test`.
4. Usar producción desde rama de *release* aprobada, NO `main` ni
   `feat/cap-commercial` (esta última recibe commits frecuentes).
5. Framework Vite/React; raíz `/`; comando `npm run build:launch`;
   output `dist`; entorno Node 22. No introducir secrets en variables VITE.
6. Verificar build sin nuevas dependencias, 62 JSON allowlisted, y enlace
   final real `*.pages.dev`. No inventar de antemano su nombre.
7. Agregar el dominio `www.rutacap.es` en Cloudflare Pages > Custom domains;
   **solo después** crear CNAME `www` en OVH a `<proyecto-real>.pages.dev`.
   No crear CNAME si falta el alta del dominio en Pages.
8. Para `rutacap.es` sin www, Cloudflare Pages requiere zona administrada
   por Cloudflare y cambio de nameservers. **No cambiar nameservers sin
   exportar y cotejar la zona DNS existente**, incluidos MX, SPF, DKIM,
   DMARC, registros Zimbra y verificaciones de dominio. No presuponer que
   existe copia completa, ni cambiar el registrador OVH.
9. Si no se puede preparar la raíz sin comprometer correo, lanzar primero
   `www.rutacap.es` con autorización, y dejar apex pendiente.

Referencias proveedor:
https://developers.cloudflare.com/pages/get-started/git-integration/
https://developers.cloudflare.com/pages/configuration/custom-domains/
https://developers.cloudflare.com/pages/configuration/headers/
https://developers.cloudflare.com/pages/platform/limits/

## Requisitos reales antes de pulsar "publicar"
- Confirmar titular/responsable del sitio, correo de contacto y texto de
  privacidad y aviso legal ajustado al piloto. No escribir datos
  identificativos particulares en el repositorio público sin consentimiento.
- Documentar el tratamiento de direcciones IP/logs del proveedor y datos
  guardados en IndexedDB, incluso cuando la aplicación no exija registro.
- Revisar derechos de reproducción/reutilización del banco de 8.655 preguntas
  y de los 26 modelos históricos. C19/C20 documentan que **NO está cerrada
  la autorización de reutilización**. Que un PDF sea accesible en el portal
  público no resuelve automáticamente su licencia; no distribuir el corpus
  con una afirmación falsa de derechos.
- Confirmar con fuentes oficiales errores/retenciones y describir claramente
  qué contenido es histórico o está pendiente de revisión. No falsear
  cobertura regional.
- Ejecutar prueba móvil real en dos navegadores: primera carga, simulacro,
  PDF, recarga, persistencia, actualización del banco, comportamiento offline,
  aviso de carácter no oficial, favicon y viewport.
- Capturar evidencia de HTTP 200 para /, /data/index.json,
  /data/exams/index.json, /data/exams/frequency_by_bank.json, JS/CSS,
  icon.svg, manifest.webmanifest, sw.js; 404 de expedientes editoriales.
- Guardar copia del artefacto `dist` de GitHub Actions y commit SHA
  exacto para posible rollback.
- No ofrecer Google login, sincronización, pagos ni promesa de respuestas
  oficiales verificadas, puesto que no están habilitados.

## Pasar de beta gratis a cobro: puerta separada
Antes de iniciar actividad económica retribuida: asesoramiento sobre
alta censal AEAT modelo 036; si habitual, alta en RETA;
condiciones comerciales, IVA/facturas, información al consumidor,
derechos del corpus y requisitos de seguridad/privacidad.
No funciona solo con un botón de Stripe: una suscripción debe validarse
en servidor con identidad, webhook, idempotencia y derecho de acceso.
No procesar datos de tarjetas en la aplicación alojada en plan gratuito
de Cloudflare (prohibición contractual específica del plan Free).

Fuentes:
https://sede.agenciatributaria.gob.es/Sede/censos/plazo-presentacion-modelo-306-037.html
https://portal.seg-social.gob.es/wps/portal/importass/importass/Colectivos/trabajo%2Bautonomo/guia
https://www.cloudflare.com/terms/
https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814

## Puertas de autorización
- PREPARACIÓN repositorio: sí.
- PUBLICACIÓN REAL EN INTERNET: pendiente de acción/permiso final
  y de resolver privacidad, derechos del corpus y dominio.
- CAMBIOS DNS / OVH: no autorizados.
- PAGOS / CUENTAS / SUPABASE PRODUCTIVO: no autorizados.
- MERGE / MAIN / VERCEL PROD: no autorizados.
