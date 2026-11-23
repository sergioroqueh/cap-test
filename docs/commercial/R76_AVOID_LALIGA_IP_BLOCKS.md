# RutaCAP — R76: decisión de alojamiento frente a bloqueos de LaLiga
Fecha: 23/11/2026. Estado: PREPARACIÓN, sin contratación ni publicación.

## Corrección de R75
Cloudflare Pages **NO es el alojamiento público recomendado** si una
prioridad del proyecto es minimizar los bloqueos colaterales de LaLiga
durante los partidos en España. Tampoco Vercel está exento de incidencias.
No se garantiza que ningún proveedor sea inmune.

La investigación de OONI (enero-junio 2026) encontró 554.507 dominios
afectados de 9,2 millones analizados, con 501.305 dominios atribuidos
a Cloudflare en sus resultados. Esos porcentajes describen los dominios
afectados observados, NO la probabilidad de caída de una nueva web.
Vercel publicó un informe propio sobre bloqueos a su infraestructura.

Fuentes:
- https://ooni.org/post/2026-laliga-collateral/
- https://vercel.com/blog/update-on-spain-and-laliga-blocks-of-the-internet
- https://www.rtve.es/noticias/20260906/temporada-liga-vuelve-bloqueo-ip-masivo-iptv-ilegal-consecuencias/17203018.shtml

## Arquitectura candidata para el piloto público
- Mantener `rutacap.es` registrado y con DNS en OVHcloud.
- Un OVHcloud VPS básico, con IPv4 asignada individualmente, IP no
  reutilizada en proxy compartido, acceso público directo (DNS A),
  HTTPS automático mediante Caddy.
- Alojar solo el resultado estático `dist/` de
  `npm run build:launch`; ningún secreto y ninguna API de pagos
  dentro del servidor. Supabase sigue siendo una decisión futura
  independiente.
- NO añadir Cloudflare Proxy/CDN/Pages/Workers en el camino de petición.
  Si se utilizara un proveedor DNS distinto de OVH en el futuro,
  mantener los registros web en modo DNS-only.
- Proponer también IPv6 solo tras verificar conectividad/ruta para
  no crear una segunda IP de publicación sin auditoría.
- Esta decisión reduce la exposición colateral de IP compartida; NO
  previene ataques, caídas del VPS, errores humanos, indisponibilidad
  DNS, problemas del ISP ni bloqueos de IP arbitrarios.
- El mantenimiento del VPS corre a cargo del propietario: actualizaciones,
  cortafuegos, SSH por clave, TLS, registros, backup de releases y
  monitorización desde redes españolas. OVH mantiene el hardware/red.
- OVH VPS 2027 VPS-1 anuncia (23-11-2026): desde 3,81 €/mes + IVA,
  4,61 €/mes IVA incluido; confirmar precio final, plazo y condiciones
  de contratación en su web antes de comprar. IPv4 incluida y SLA
  99,9 % de infraestructura, NO garantía absoluta de acceso.
- No autorizar ni crear compras ni facturación con este runbook.

Fuente proveedor:
https://www.ovhcloud.com/es-es/vps/
https://blog.ovhcloud.com/es/posts/vps-2027/
https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/secure-your-vps
https://caddyserver.com/docs/automatic-https

## Plantilla preparada, NO activa
`ops/rutacap/Caddyfile.example` sirve rutas `/data/*` y `/assets/*`
con respuestas 404 reales para material inexistente; SPA con fallback
a `index.html` solamente para otras rutas. HTTPS automático una vez
que el DNS apunta al servidor y 80/443 están accesibles.

## Procedimiento operativo propuesto
1. Antes de compra: revisar derechos de redistribución del banco
   y los 26 modelos (C19/C20), aviso legal, privacidad y responsable.
   El paquete completo no debe hacerse público mientras los derechos
   de reutilización no estén aclarados.
2. Si se aprueba el coste, crear VPS con IPv4 independiente asignada;
   anotar precio final, fecha, IP, acceso administrativo por canal privado.
   Jamás compartir claves ni tokens en GitHub/ChatGPT.
3. Configurar sistema con actualizaciones de seguridad, SSH por clave,
   usuario no-root con sudo, firewall para 80/443 y SSH restringido,
   copias de seguridad, y Caddy procedente de repositorios oficiales.
   No deshabilitar el acceso de emergencia sin comprobar el alternativo.
4. Subir copia exacta del artefacto CI con su SHA en directorio versionado
   `/srv/rutacap/releases/<gitsha>/`, propiedad de un usuario de despliegue
   sin privilegios. No transferir `data-src`, archivos editoriales,
   secretos, `.env` reales ni la carpeta raíz del repositorio público.
5. Apuntar `/srv/rutacap/current` al release aprobado; validar
   la sintaxis de Caddyfile con `caddy validate` antes de recargar.
   Preparar rollback con el release anterior sin redescargar datos.
6. Para probar sin tocar raíz de dominio, planificar un subdominio
   de prueba con A directo a IPv4 del VPS y TLS automático.
7. Cuando haya autorización y gates legales superados, cambiar en
   OVH únicamente A (y AAAA si procede) de `rutacap.es` y `www`
   según configuración final; conservar registros MX, SPF, DKIM,
   DMARC y cualquier otro servicio. Documentar DNS anterior.
8. Verificar HTTPS, 62 JSON, PWA, 404 de expedientes editoriales,
   navegación, examen, PDF, almacenamiento local, control de cache,
   accesibilidad desde redes de DIGI, Movistar y datos móviles;
   probar también durante jornada de LaLiga, sin usar la ausencia
   de un fallo puntual como garantía permanente.
9. Añadir monitor externo y alerta del usuario para caídas.
   No publicar enlaces ni cobrar hasta completar las puertas.
10. Si la aplicación crece, valorar infraestructura administrada,
    segundo proveedor/IP y continuidad de servicio. DNS failover
    automático NO está incluido en este MVP.

## Estados
- Rama release/rutacap-beta-2026-11 permanece congelada.
- Preparación de la alternativa con IPv4 dedicada: autorizada
  únicamente a nivel documental/configuración.
- Contratación/alta VPS: NO.
- Cambios OVH / DNS: NO.
- Publicación pública / distribución corpus: NO.
- Merge/main, Supabase productivo, pagos: NO.
