# RutaCAP — R64: diagnóstico de CI y verificación acotada

Fecha: 19/11/2026. Repositorio: sergioroqueh/cap-test. Rama `feat/cap-commercial`. PR #21 OPEN DRAFT.
Base R63: `b1358edfa3032e5f0aecc5214ee03e3dec3266a2`.

## 1. Bloqueo de CI confirmado por GitHub

Consultas REST de GitHub: PR #21 tiene `mergeable=false` y
`mergeable_state=dirty`. No hay ninguna ejecución de Actions asociada
a `b1358edfa3032e5f0aecc5214ee03e3dec3266a2`.
La comprobación «Vercel Preview Comments» no equivale a CI de compilación.

La base histórica del PR es `d979ecac504f2099b885a2d2a371c070ef4fb808`.
El HEAD de `main` es `d91e59e9f0e648a558a3cbcd93b77fcec7e9612a`,
un commit separado y previo de corrección PWA network-first. La comparación
entre la base y ese HEAD de main devuelve **únicamente `public/sw.js`**.
La rama comercial también modificó `public/sw.js` respecto de la base
para la caché segregada de RutaCAP, de modo que es el único fichero tocado
por ambos lados. La reconciliación de esas dos políticas de caché requiere
decisión expresa y queda fuera de R64.

GitHub documenta que un workflow `pull_request` no arranca ante conflictos
de combinación. El workflow `.github/workflows/ci.yml` contiene
`pull_request: branches: [main]` y `workflow_dispatch` tanto en
`main` como en la rama. Por tanto, una ejecución manual de
**Validate CAP Test** seleccionando `feat/cap-commercial` en
GitHub Actions permite validar esta rama sin modificar main ni resolver
el conflicto y sin realizar despliegue.

## 2. Comprobaciones realmente ejecutadas en R64

- Node v22.16.0: `node --check` del empaquetador R63 y su test: PASS.
- Node v22.16.0: `node --test scripts/test_public_package_r63.mjs`
  con fixtures exclusivamente sintéticos, **17/17 PASS**, ninguna falla.
- `node --check` sobre el service worker comercial: PASS.
- Revisión estática de `vite.config.ts`: `closeBundle` engancha el
  empaquetado únicamente a `build`, con fallo cerrado y ejecución separada
  de `--verify` en los scripts de compilación.
- Revisión estática de CI: pruebas sintéticas R63 y verificaciones de
  presencia en `public/data`, ausencia en `dist/data`, manifiesto
  SHA-256 y E2E están definidos, sin que exista una ejecución válida.

Se generó exclusivamente en un entorno aislado un paquete PWA **sintético**
con 62 JSON, 33 rutas de cuestionarios y 26 rutas históricas. Se intentó
servirlo en 127.0.0.1 y probar con Chromium disponible en el entorno.
El navegador devolvió `net::ERR_BLOCKED_BY_ADMINISTRATOR` en la navegación
local. Este **bloqueo del entorno** impide atribuir un PASS o FAIL al
service worker: no se ejecutó el flujo en el navegador.

## 3. Pruebas pendientes (NO declaradas PASS)

- `npm ci`, `npm run build`, `npm run build:preview`, `tsc -b`
  contra el HEAD de la rama y las dependencias reales.
- Banco original 8.655/33, histórico 26/2.600, scoring, elegibilidad
  Viajeros, frecuencias, resultados, PDF y persistencia en CI real.
- Service worker, precarga de 66 rutas, ausencia de ficheros editoriales
  en la distribución y responsive real 390/430/768/1440 en Chromium.
- Inventario hash SHA-256 generado en CI con datos reales.

No se dispone de clon completo ni de conexión DNS desde el contenedor,
y la herramienta GitHub conectada no expone el disparador de Actions.
No se ha intentado reproducir datos reales parciales ni modificar la PWA.

## 4. Procedimiento seguro para desbloquear pruebas

En GitHub > Actions > **Validate CAP Test** > **Run workflow**,
seleccionar `feat/cap-commercial` y ejecutar. El workflow ya dispone de
`workflow_dispatch` en `main`; no necesita cambios en el repositorio.
No ejecutar el workflow de despliegue ni usar merge. Una vez concluido,
consultar los jobs y artefactos de R63 y documentar los fallos concretos,
si hubiera alguno, antes de autorizar una Preview protegida.

Para dejar PR #21 sin conflicto en una ronda posterior, revisar y resolver
explícitamente `public/sw.js` con un diseño compatible con la aplicación
de producción y la comercial; no reemplazar una versión por la otra a ciegas.

## 5. Límites de la ronda

**No se han modificado** scoring, preguntas, frecuencias, datos fuente,
Supabase, main, service worker, Vercel, producción ni protección de acceso.
No hay despliegue ni merge. PR #21 sigue OPEN DRAFT.
R58 READY protegida permanece sin tocar.

**Resultado R64: bloqueo de CI diagnosticado; pruebas sintéticas PASS;
compilación integral/Chromium real pendientes, sin atribuirles un PASS.**
