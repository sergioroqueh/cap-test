# RutaCAP — R80: pie legal no solapado (23/11/2026)

## Diagnóstico con captura del propietario
El pie legal de R79 se veía torcido: enlaces pegados al borde superior
de un contenedor redondeado. NO era una incidencia de Caddy ni DNS.
La regla global `nav { position: fixed; bottom:0; ... }` de
`src/styles.css` se aplicaba al `<nav>` del nuevo pie legal,
superponiéndolo a la barra principal `.app>nav`.

## Corrección precisa
- `src/LegalLinks.tsx`: sustituir `<nav>` por contenedor
  `<div role="navigation" aria-label="Enlaces legales">` para
  conservar semántica accesible y evitar el selector global.
- `src/legalLinks.css`: pie cuadrado/discreto, compacto,
  adaptativo a móvil, enlaces visibles con estados hover/foco
  y espacio inferior ante barra fija. Respeta tema mediante variables.
- No cambiar `App.tsx`, preguntas, scoring, archivos del banco,
  rutas, frecuencia, Supabase ni service worker.
- `scripts/e2e_launch_beta.mjs`: prueba en Chromium 390/1440
  que los cuatro enlaces queden DENTRO del pie en flujo normal,
  además de las pruebas existentes de acceso beta/persistencia.

## Activación operativa prevista
1. Crear artefacto `npm run build:launch` en CI PASS,
   registrar ZIP SHA256.
2. Subir el ZIP al VPS como release nueva, SIN borrar R79.
3. Verificar SHA256, extraer en /srv/rutacap/releases/<sha>;
   activar con cambio atómico /srv/rutacap/current.
   Caddy sirve la nueva compilación sin reinicio.
4. Refrescar beta.rutacap.es con navegación normal y probar los
   enlaces legales. Los documentos privados en /srv/rutacap/legal
   no cambian. Mantener la basic_auth de beta.
5. En caso de regresión, restaurar symlink a
   /srv/rutacap/releases/dbefec2 (R79). No tocar DNS.
6. La beta pública de rutacap.es todavía NO está abierta;
   quedan cuestiones de derechos del corpus y revisión de
   los documentos legales, además del cambio controlado DNS.

## Datos sensibles
No incorporar NIF, domicilio, hash de basic_auth ni imágenes
de páginas legales a GitHub.
