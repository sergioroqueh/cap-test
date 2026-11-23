# RutaCAP — R78: puerta final de publicación pública
Fecha: 23/11/2026 · Objetivo: demostración jueves 26/11/2026

## 1. Evidencia de funcionamiento
- VPS Ubuntu 24.04.5 actualizado, Caddy 2.11.9; TraderAI detenido.
- App en `/srv/rutacap/releases/204f855/`, symlink `/srv/rutacap/current`.
- Compilación CI 45229832697 SUCCESS, commit 204f855.
- `beta.rutacap.es` resuelve a 146.59.235.111.
- HTTPS: `curl` certificación SSL 0; `HTTP 401` sin clave;
  `HTTP 308` redirección a HTTPS.
- Usuario probó desde móvil sin Wi-Fi: 5/5 PASS
  (HTTPS, basic auth, acceso beta, examen, persistencia).
- `rutacap.es` y `www.rutacap.es` siguen en OVH con
  A 213.186.33.5. No se ha cambiado la raíz ni `www`.

## 2. Verificación de derechos del corpus (NO CONCLUIDA)
- Banco general: 8.655 preguntas/33 cuestionarios, empaquetado R63.
  No hay matriz verificable con un titular/licencia/URL por
  cuestionario en el artefacto público; el origen y la licencia
  de toda la colección NO están acreditados.
- Archivo: `data-src/cap-exams/manifest.json` vincula 25 modelos
  a páginas de `Examenes TOTALES.pdf`, un PDF recopilatorio que
  fue aportado al proyecto, más PDFs de plantillas. Esto sirve para
  trazabilidad de transcripción, no es prueba de licencia de
  reproducción y distribución de cada titular original.
- Sede del Ministerio de Transportes: admite reutilización comercial
  y no comercial de información *sujeta a esos términos*, con
  atribución de fuente, última actualización (si consta), prohibición
  de desnaturalizar e inexistencia de patrocinio oficial. No extender
  esta autorización a archivos de origen distinto.
  Fuente: https://sede.transportes.gob.es/aviso-legal
- JCCM y otras administraciones: cotejar avisos legales aplicables a
  páginas originales y titularidad de PDFs, no asumir equivalencia
  por ser PDFs oficiales.
- Ley 37/2007 art. 3.3.e: derechos de terceros fuera del régimen
  general. Fuente: https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814
- C19/C20: procedencia editorial de respuestas ≠ licencia de textos;
  seis holds CLM C13 siguen privados/excluidos de release.
- Decisión conservadora: NO retirar basic_auth ni abrir la copia
  íntegra del banco hasta cerrar esa matriz o limitar a contenido
  con autorización comprobada.

## 3. Identidad / privacidad / condiciones (NO CONCLUIDA)
- Elegir titular responsable (persona física/jurídica) y correo de
  contacto que realmente exista; no inventar datos ni subir
  domicilio, DNI o datos personales al repositorio público.
- Redactar y publicar aviso legal, política privacidad y términos de
  beta, accesibles desde la interfaz, incluyendo tratamiento de IP,
  posible alojamiento OVHcloud, progreso almacenado localmente,
  ausencia de sincronización/pagos y canal de contacto para derechos.
- No activar analítica, publicidad, marketing ni cookies no esenciales
  por defecto. Auditar la aplicación y el hosting antes de afirmar
  que carecen de cookies no esenciales.
- A efectos de LSSI, actividad económica importa más que cobrar
  directamente; una web gratis que genera ingresos indirectos también
  puede estar sujeta.
  Fuente: https://lssi.digital.gob.es/lssi/la-ley/preguntas-frecuentes
- Revisar condiciones de responsabilidad por contenido y diferenciar
  claramente herramienta independiente de administración oficial.

## 4. Preparación técnica, sin activación
- Mantener intacto el `basic_auth` de beta (nunca compartir el hash).
- Añadir (NO sustituir) los bloques de
  `ops/rutacap/Caddyfile.public-addon.example` al Caddyfile ACTUAL
  del VPS cuando el propietario autorice la publicación tras
  resolver puertas 2 y 3.
- Copia previa segura:
  `sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-public.bak`
- Validación de sintaxis antes de recargar:
  `sudo caddy validate --config /etc/caddy/Caddyfile`
- Caddy ya está habilitado, UFW 80/443 abiertos, HTTPS beta funcionando.
  El nuevo host pedirá su propio certificado al acceder por DNS.

## 5. DNS OVHcloud después de los gates
Cambiar **solo**:
- A `@`: 213.186.33.5 => 146.59.235.111
- A `www`: 213.186.33.5 => 146.59.235.111
No crear AAAA sin verificar IP v6; la zona actual no tiene AAAA.
Comprobar redirecciones OVH en panel "Redirección":
TXT `@` = `1|www.rutacap.es` y TXT `www` = `3|welcome`
pueden pertenecer al mecanismo de redirección. Conservar
capturas/valores antiguos; retirar solamente redirecciones
efectivamente obsoletas tras verificar que ya no afectan al acceso.
**NO TOCAR** NS, MX, SPF, Zimbra CNAME, correo, otros TXT.
El CNAME ftp -> rutacap.es seguirá siguiendo a la web nueva;
revisar si ese FTP heredado es usado (no tocar por defecto).

## 6. Comprobaciones de apertura (solo bloqueantes)
`getent ahostsv4 rutacap.es` debe resolver IPv4 VPS.
`curl -sSI https://rutacap.es/` debe responder 200, SSL válido,
sin diálogo de autenticación.
`curl -sSI https://www.rutacap.es/` debe redirigir a raíz.
`curl -sSI https://beta.rutacap.es/` debe continuar respondiendo 401.
Preguntas /data/ devuelven 200, expedientes editoriales y faltantes 404.
Validación breve desde móvil con datos: entrada beta, estudio, PDF,
persistencia. No cambiar el banco tras dar la URL sin control de release.

## 7. Rollback
Backup Caddyfile; DNS A anteriores anotados; paquete dist anterior
conservado. Si falla la versión nueva, el symlink de
`/srv/rutacap/current` vuelve a release anterior sin reinstalar.
Si falla DNS, restaurar A en OVH. Caddy beta privado NO se elimina.

## 8. Estado de permisos
Publicación general: el usuario quiere continuar, pero dos gates
(licencias del corpus e identificación/privacidad) siguen abiertos.
No se ha realizado ningún cambio en DNS público, cuentas, pagos
ni Caddy del VPS con esta preparación GitHub. La beta privada
actual sigue siendo accesible con contraseña.
