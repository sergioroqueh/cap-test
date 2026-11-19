# C53 — Actualización segura de jsPDF y cierre del aviso crítico (18/11/2026)

**Estado:** `feat/cap-commercial`, PR #21 DRAFT. Solo dependencias,
lockfile, workflow y test de exportación. **No UI, banco, scoring, Supabase
real, migraciones, cloud, Vercel, pagos, merge ni despliegue.**

## Origen y corrección

La auditoría C52 encontró seis avisos en dependencias: **cinco HIGH, uno
CRITICAL**. El aviso crítico afectaba a `jspdf@3.0.4` y sugiere una
versión corregida `4.2.1`; las notas oficiales de la versión confirman
correcciones de inyección HTML y objetos PDF:
https://github.com/parallax/jsPDF/releases/tag/v4.2.1 .

RutaCAP importa `jsPDF` en `src/pdfExport.ts` únicamente para
generar pruebas y soluciones imprimibles, mediante `text`,
`splitTextToSize`, `line`, `roundedRect`, `addPage`, `setPage` y
`save`. Este código **no ha sido cambiado**.

Se ha actualizado exactamente `jspdf` de `3.0.4` a `4.2.1` en
`package.json` y en `package-lock.json`; se mantuvieron las demás
dependencias directas sin variación. El lockfile procede de una instalación
npm en un GitHub Actions runner desechable, no de una propuesta manual.

## Evidencia real y criterio de aceptación

**Preflight con jsPDF 4.2.1:** [GitHub Actions C53 #44340795567](https://github.com/sergioroqueh/cap-test/actions/runs/44340795567)
**SUCCESS**, antes de incorporar el lockfile a la rama. El ensayo hizo:
- instalación `npm ci` desde el lock anterior, actualización aislada a
  `4.2.1`, segunda instalación limpia `npm ci` y compilación Vite
  `npm run build:preview`;
- `npm audit` **antes:** 6 avisos (5 HIGH, 1 CRITICAL);
- `npm audit` **después:** 5 avisos (5 HIGH, **0 CRITICAL**);
- Chromium real sobre preview estrictamente local, con descarga PDF de
  **100 preguntas** de diciembre de 2023: **23 páginas, 80.244 bytes**,
  nombre `rutacap-cap-mercancias-02-dic-2023-soluciones.pdf`, cabecera
  PDF válida, fin `%%EOF`, cuadrícula de soluciones y leyenda;
  verificación de notas técnicas R27 y de marcas `NP - sin puntuar`;
- `cloudConfigured=false` y exclusión de marca de catálogo privado en
  bundle público: **PASS**;
- ninguna clave OAuth, conexión externa ni servicio real.

**Validación sobre HEAD final:** el workflow C53 usa `npm ci`
**sin mutar el lockfile**, comprueba jsPDF, cero avisos críticos y repite
únicamente el build preview y el PDF real. Su resultado debe comprobarse
por SHA/CI antes de afirmar cierre definitivo.

## Riesgos restantes: NO GO comercial todavía

Permanecen avisos HIGH en cinco paquetes:

- `vite@8.3.8`;
- `@vitejs/plugin-react@6.3.0`;
- `fdir` (dependencia transitiva);
- `picomatch` (dependencia transitiva);
- `tinyglobby` (dependencia transitiva).

El audit sugirió **downgrades con cambios mayores** (`vite@6.2.7` y
`@vitejs/plugin-react@5.2.0`). **No se ejecutaron**: una propuesta
automática de downgrade no prueba compatibilidad ni que las fuentes y
rutas afectadas puedan explotarse en RutaCAP. Hay que comprobar los
identificadores, rangos afectados, vías de ataque, contexto de uso en
dev/build y disponibilidad de una corrección apropiada. No se descartan
por ser devDependencies; el servidor de desarrollo y la cadena de build
también importan.

La auditoría final de 5 HIGH **no acredita ausencia de fallos de
seguridad**; la beta pública continúa con puerta de revisión pendiente.
No usar `npm audit fix --force` ni eliminar pruebas para obtener verde.

## Continuidad

1. C54 acotada: clasificar esos cinco advisories por ID y superficie
   (servidor de desarrollo, fase build, bundles del navegador); evaluar
   correcciones mínimas o mitigaciones, sin downgrade mayor automático.
2. Resolver R32 en un circuito **editorial distinto**: sus discrepancias
   35/128, incluidas tres de frecuencia, no deben ocultarse.
3. Solo después, planificar primera integración autorizada con servicios.
4. No repetir suites sintéticas C41–C50 ni cambiar UI o scoring.

La evolución de interfaces (esquinas más cuadradas) queda anotada para
una futura ronda de diseño, NO forma parte de C53.
