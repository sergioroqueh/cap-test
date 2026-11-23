# RutaCAP — R79: titular persona física, avisos legales y correo (23/11/2026)

## Datos confirmados por el propietario
- Titular: persona física (no empresa ni asociación).
- El titular usará su propio NIF/DNI y domicilio particular temporalmente.
- Canal público de contacto previsto: **info@rutacap.es**.
- Servicio beta gratuito; sin cobros, cuentas remotas ni marketing.
- NO se han aportado a GitHub ni a este expediente nombre legal,
  NIF o domicilio. Nunca solicitarlos en un issue, PR, chat público
  ni copiarlos desde otras fuentes sin consentimiento.

## Marco legal revisado
- LSSI 34/2002, artículo 10: cuando sea aplicable, identificar
  nombre/domicilio/contacto y NIF de forma pública, permanente
  y accesible. El domicilio privado publicado puede indexarse.
  https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10
- La gratuidad sola no exonera de LSSI si existe actividad económica
  directa o indirecta. Las circunstancias de esta beta deben
  evaluarse separadamente de una futura oferta comercial.
  https://lssi.digital.gob.es/lssi/la-ley/aspectos-basicos/como-se-aplica-la-lssi
- AEPD: facilitar información básica y ampliada sobre tratamiento,
  fines, base jurídica, responsable, destinatarios, conservación
  y derechos, preferiblemente por capas.
  https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion
- Ley 37/2007: la reutilización de información pública no abarca
  automáticamente documentos sujetos a propiedad de terceros.
  https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814

## Implementación PREPARADA, NO desplegada
1. `src/LegalLinks.tsx` footer solo cuando `VITE_CAP_LAUNCH=true`;
   enlaces a /legal/aviso-legal.html, /legal/privacidad.html,
   /legal/condiciones-beta.html y mailto:info@rutacap.es.
2. `src/main.tsx` incluye el componente.
3. `ops/rutacap/legal/build_legal_pages.py` genera tres HTML
   directamente en el VPS, pidiendo al propietario nombre, NIF
   y domicilio por terminal local. No envía datos a GitHub;
   ni añade datos al build Vite. Requiere confirmación explícita
   de divulgación pública del domicilio y NIF. Los HTML resultantes
   serán PUBLICOS cuando Caddy sirva la ruta legal.
4. `ops/rutacap/Caddyfile.public-addon.example` sirve exclusivamente
   en el dominio público /legal/* desde /srv/rutacap/legal,
   preservando basic_auth del subdominio beta.
5. GitHub Actions build-launch valida código TS/React, E2E móvil/PC
   y sintaxis Python sin escribir información identificativa.

## Comandos futuros (NO ejecutar hasta revisar los textos)
En el VPS, después de descargar el script desde un commit validado:
```bash
python3 /ruta/local/build_legal_pages.py --confirm-public-disclosure
sudo -u caddy test -r /srv/rutacap/legal/aviso-legal.html && echo OK
```
No introducir DNI/domicilio por comandos bash con argumentos, para
evitar su aparición en el historial. El script los solicita de forma
interactiva, ocultando el NIF.

## Puertas pendientes antes de liberar acceso público
- Verificar que **info@rutacap.es** existe y recibe/responde correos
  reales desde un buzón externo; MX existente no garantiza el alta
  del buzón. Confirmar panel OVHcloud y envío/recepción.
- Revisar personalmente datos y textos legales; si se elige el
  domicilio particular, aceptar conscientemente su divulgación pública.
- Confirmar retención de logs/journal del VPS, encargados reales y
  transferencias; no dar por verificados todos los apartados del
  borrador de privacidad sin inspección del sistema.
- Auditar almacenamiento/cookies no esenciales antes de afirmar
  que no se necesita interfaz de consentimiento.
- Resolver procedencia/licencia de los 8.655 contenidos del banco
  y los 26 exámenes, o excluir los que no tengan reutilización
  acreditada. Ver R78 y C19/C20.
- Recompilar release con footer legal, validar GitHub Actions,
  colocar HTML legales y activar Caddy público en el momento
  autorizado. Ningún dato personal en el bundle, JS ni repositorio.
- DNS públicos @/www siguen sin modificarse; no publicar aún.

## Estado
Preparación de documentos y código de enlaces en rama feat/cap-commercial.
Beta https://beta.rutacap.es continúa protegida sin modificaciones.
Sin pagos, sin migraciones, sin merge, sin cambios en OVH DNS ni Vercel.
