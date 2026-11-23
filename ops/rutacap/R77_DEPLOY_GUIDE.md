# R77 — Inicio seguro del despliegue en VPS OVHcloud (23/11/2026)

## Alcance
Inspección, empaquetado y preparación de aplicación estática RutaCAP sin
alterar los servicios de TraderAI existentes. La autorización del usuario
es para guiar el despliegue: la publicación pública con corpus no se
ejecutará hasta cumplir revisión de derechos, aviso legal y privacidad.

## 1. Diagnóstico remoto, no destructivo
Desde el equipo Windows del propietario (PowerShell):

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_traderai_vps" ubuntu@TU_IP_DEL_VPS
```

No pegar contraseñas, claves, tokens, archivos .env, datos de brokers ni
IP/credenciales en incidencias públicas. Una vez conectado, ejecutar los
comandos de `ops/rutacap/check_vps_readonly.sh` o, equivalentes, revisar
`lsb_release -ds`, `free -h`, `df -h /`, `ss -lnt`,
`ufw status` y `systemctl list-units` para detectar servicios.

No ejecutar `apt upgrade`, reinicios, cambios en UFW, cambios de SSH,
Nginx/Caddy ni mover directorios /opt/ hasta examinar el resultado.

## 2. Invariantes
- TraderAI V5, V6, SHADOW no se tocan, no se detienen ni se reinician.
- NO se abren puertos de base de datos a Internet.
- SSH 22 y su llave actual quedan operativos.
- Construir RutaCAP fuera del VPS: artefacto GitHub Actions
  `rutacap-public-beta-dist` compilado con Node 22 y
  `npm run build:launch`, 62 JSON públicos allowlisted; no repo completo.
- Servir desde `/srv/rutacap/releases/<sha>` como usuario sin
  privilegios y con symlink `/srv/rutacap/current`, sin secretos.
- Caddy publica HTTPS con certificado gratuito renovable.
- OVH DNS: editar solo registros web A / www cuando proceda;
  NUNCA NS/MX/SPF/DKIM/DMARC/correo.
- La web vieja Vercel y main continúan intactas.
- Revisión de derechos de reutilización y textos de privacidad
  son puertas de publicación, no tareas opcionales.

## 3. Prueba previa privada
Antes de conectar DNS: copia local aislada y servidor HTTP
**solo en 127.0.0.1** del VPS, que se inspecciona desde Windows usando
túnel SSH. No exponer :8085 en UFW ni en el proveedor.

Comando previsto en VPS (cuando tengamos el artefacto):
```bash
cd /srv/rutacap/current
python3 -m http.server 8085 --bind 127.0.0.1
```

En una segunda ventana PowerShell:
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_traderai_vps" -N -L 8085:127.0.0.1:8085 ubuntu@TU_IP_DEL_VPS
```
Probar `http://localhost:8085/` desde PC. Detener servidor de prueba
con Ctrl+C; no convertirlo en servicio público de producción.

## 4. Pasos posteriores, condicionados a diagnóstico
1. Comprobar conflictos de puertos 80/443 y superficie de ataque.
2. Preparar usuario `rutacap` y carpeta /srv/rutacap.
3. Instalar Caddy de repositorio oficial y configurar
   `ops/rutacap/Caddyfile.example`. Validar antes de activar.
4. Reservar copia de rollback y descargar el artefacto de CI
   `https://github.com/sergioroqueh/cap-test/actions/runs/45229832697`.
   Este run concluyó SUCCESS para el commit 204f855e...;
   release/rutacap-beta-2026-11 se creó con esa SHA.
5. Configurar DNS web de OVH únicamente si se ha autorizado publicación
   pública y las puertas legales/editoriales están resueltas.
6. Probar desde varias operadoras/redes, HTTPS TLS, actualización PWA,
   offline, 404 de datos privados, y supervisar salud del servidor.
7. Mantener flujo de despliegue MANUAL de artefactos CI aprobados;
   ningún SSH secret en GitHub ni deploy automático sin revisión.

Fuentes:
- https://caddyserver.com/docs/install
- https://caddyserver.com/docs/automatic-https
- https://docs.ovhcloud.com/es/guides/web-cloud/domains/dns-zone-a-record-creation
