#!/usr/bin/env bash
# RutaCAP R77 — INSPECCIÓN ÚNICAMENTE. No instala ni modifica servicios.
set -u
echo "=== RutaCAP VPS preflight (read-only) ==="
echo "--- Sistema ---"
if command -v lsb_release >/dev/null 2>&1; then lsb_release -ds; else cat /etc/os-release | grep '^PRETTY_NAME='; fi
echo "--- Recursos ---"
free -h
df -h /
echo "--- Servicios relevantes funcionando ---"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | grep -Ei 'trading|trader|shadow|caddy|nginx|apache|docker' || true
echo "--- Estado de servicios trader que existan ---"
for service in trading-ai-v5.service trading-ai-v6.service traderai-shadow.service; do
 if systemctl list-unit-files "$service" --no-legend --no-pager 2>/dev/null | grep -q "^$service"; then
   printf '%s: ' "$service"
   systemctl is-active "$service" || true
 fi
done
echo "--- Puertos 80 y 443 (servicios web existentes) ---"
if command -v sudo >/dev/null 2>&1; then
 sudo -n ss -ltnp 2>/dev/null | grep -E '(^State|:80[[:space:]]|:443[[:space:]])' || ss -ltn 2>/dev/null | grep -E '(^State|:80[[:space:]]|:443[[:space:]])' || true
else
 ss -ltn 2>/dev/null | grep -E '(^State|:80[[:space:]]|:443[[:space:]])' || true
fi
echo "--- Firewall (sin cambios) ---"
if command -v ufw >/dev/null 2>&1; then
 sudo -n ufw status 2>/dev/null || echo "No se puede leer UFW sin sudo; NO lo modificamos."
else
 echo "No se detectó UFW."
fi
echo "--- Caddy instalado? ---"
if command -v caddy >/dev/null 2>&1; then caddy version; else echo "No instalado."; fi
echo "--- Fin: sin cambios ---"
