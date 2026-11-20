# RutaCAP — R70 READY y R71 feedback contextual de accesos rápidos

Fecha: 20/11/2026. Repositorio sergioroqueh/cap-test.
Rama feat/cap-commercial; PR #21 OPEN DRAFT, sin merge.
Main comprobada d91e59e9f0e648a558a3cbcd93b77fcec7e9612a.
R70 reutiliza el commit funcional CI #560: 254298f85afc487182a66e1030a6fa7ab36fdbd3.

## R70: Redeploy manual confirmado READY

- Vercel team: cuaderno-tecnico-team.
- Proyecto: cap-test-pruebas, prj_dXWmcfMTkLObA6JkwSz3mYtDoIbk.
- Deployment: dpl_8rwgBtqjSeRf3XocG32fZR9Jx8nH.
- URL inmutable: https://cap-test-pruebas-gghnxcwsd-cuaderno-tecnico-team.vercel.app
- Source: redeploy. Git SHA: 254298f85afc487182a66e1030a6fa7ab36fdbd3.
- API: READY, target null (Preview), aliasError null.
- Build logs: npm install; cap-test@0.1.0 build:preview;
  npm run prepare:data && tsc -b && vite build --mode cap-preview &&
  node scripts/package_public_data_r63.mjs --verify.
- Vite: building client environment for cap-preview.
- R63: package OK y verify OK; exactamente 62 JSON conservados;
  banco 8.655/33, histórico 2.600/26 y 41 informes editoriales
  retirados exclusivamente del dist/data final.
- SHA256 del manifiesto en el build Vercel R70:
  5f2548b689e408101c76ad85e9beafb6f802d8a9076980683f2dc0ceb086a5b6.
- Proyecto: Vercel Authentication continúa enabled=true,
  deploymentType=all_except_custom_domains.
- No se realizó ningún despliegue posterior desde esta ronda.

**Límite de verificación:** la autenticación del proyecto está confirmada
por configuración y la construcción por logs. No se ejecutaron solicitudes
HTTP autenticadas al contenido ni prueba anónima 401/403, por no crear
un share link temporal y debilitar el perímetro de acceso. La protección
efectiva desde una sesión anónima queda pendiente de una prueba manual
controlada.

**Observación de reproducibilidad:** el SHA256 del manifiesto del R70
(5f2548...) no coincide con el registrado en la CI #560 (1e8d56...),
aunque ambos validaron los 62 archivos y los conteos. Eso significa
que NO se ha demostrado identidad byte a byte entre ambos entornos.
Se debe investigar la diferencia en una ronda acotada sin alterar las
preguntas o las claves: comprobar hashes archivo por archivo y posibles
fuentes de orden no determinista (p.ej. .glob() sin ordenar) ANTES de
afirmar plena reproducibilidad entre CI y Vercel.

## R71: petición visual del usuario (screenshot)

Incidencia: al pulsar «Errores» o «Favoritos» en la cuadrícula superior,
el mensaje informativo aparece debajo de la sección completa «Configura tu
práctica», muy lejos del botón pulsado. Es un problema de ubicación del
aviso, no de scoring.

Cambio funcional limitado en feat/cap-commercial:

1. src/App.tsx: se distingue el contexto de llamada de los accesos
   superiores mediante fromShortcut y shortcutNotice. Los errores de
   esos botones se muestran en su panel; los demás errores conservan
   su posición previa. El contexto se mantiene tras la confirmación
   de reemplazo de una sesión. No se altera el cálculo de preguntas,
   puntuación o persistencia.
2. src/CommercialHome.tsx: aviso accesible role=status, aria-live=polite,
   inmediatamente detrás de la cuadrícula de accesos. Botón Cerrar aviso.
   Solo se ajusta el scroll con scrollIntoView(block=nearest) si el
   aviso queda fuera del viewport; respeta prefers-reduced-motion.
3. src/commercial.css: aviso a ancho completo en desktop/móvil, con
   scroll-margin para cabecera y navegación y texto adaptable.
4. scripts/e2e_r63_public_preview.mjs: comprobación de Errores/Favoritos
   en los 4 anchos 390/430/768/1440; texto, posición entre accesos y
   configurador, visibilidad y cierre.

Commit R71 funcional:
a639e1347629cd46bf5087ca750e866854cf4600.

## Puertas aún pendientes

- El código R71 **NO ha pasado todavía** una nueva CI. GitHub Actions
  no presenta ejecuciones del SHA R71; PR #21 continúa dirty por el
  conflicto anterior de public/sw.js.
- La URL R70 sigue sirviendo el SHA anterior 254298f8 (sin esta mejora).
  **No se publicó ninguna Preview R71**, ni se cambió el proyecto Vercel.
- Siguiente: ejecutar manualmente «Validate CAP Test» con
  workflow_dispatch sobre feat/cap-commercial y revisar Chromium R71.
  Tras CI SUCCESS, decidir por autorización expresa si se hace una
  nueva Preview protegida. No hacer redeploy sin autorización.
- Mantener main, Supabase, service worker, banco, scoring, R58,
  dominios de producción y protección Vercel intactos.

Estado: R70 READY y R71 cambio guardado, CI de R71 pendiente.
