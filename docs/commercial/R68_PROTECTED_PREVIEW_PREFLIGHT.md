# RutaCAP — R68: preflight de una única Preview protegida (SIN DESPLIEGUE)

Fecha de revisión: 20/11/2026.
Repositorio: sergioroqueh/cap-test; rama: feat/cap-commercial; PR #21 OPEN DRAFT.
HEAD inicial inspeccionado: 0ee68179fcd6692788882c7b2ae64777dc6284c6.
SHA funcional validado con CI: 254298f85afc487182a66e1030a6fa7ab36fdbd3.
GitHub Actions #560: https://github.com/sergioroqueh/cap-test/actions/runs/44633458463

## 1. Identidad y seguridad confirmadas

- GitHub: HEAD de feature 0ee68179..., main d91e59e9... intacta.
  PR #21 OPEN DRAFT, mergeable_state=dirty por public/sw.js.
- La comparación de HEAD con el SHA funcional validado devuelve exactamente
  tres adiciones de documentación: R66_FULL_CI_VALIDATION.md,
  R67_SW_CONFLICT_RECONCILIATION_PLAN.md y
  R67_PHYSICAL_VISUAL_TEST_RUNBOOK.md. Ningún cambio de código.
- CI #560: completed/success; job build 37/37 SUCCESS.
- Vercel: team CuadernoTecnico TEAM, slug cuaderno-tecnico-team,
  ID team_C7jTTBhmxsEP0pH8WiJDpfUO, plan hobby.
- Proyecto existente: cap-test-pruebas, ID prj_dXWmcfMTkLObA6JkwSz3mYtDoIbk,
  framework vite, Node.js 22.x.
- Conexión Git del proyecto comprobada a sergioroqueh/cap-test.
- Protección: ssoProtection.enabled=true, modo all_except_custom_domains.
  Una URL de despliegue inmutable .vercel.app permanece protegida;
  NO enlazar o asignar dominio personalizado ni desactivar protección.
- Variables del entorno del proyecto consultadas sin desencriptar valores:
  0 entradas. No crear ni modificar variables para esta prueba.
- El último deployment registrado para el HEAD 0ee68179... aparece CANCELED,
  así como los auto-intentos R63–R67. No constituyen una Preview lista.
- Última Preview READY identificada: dpl_HWCmVwKBFr4KRs9vrm3oHqiuwQMG,
  URL https://cap-test-pruebas-pzjrluat6-cuaderno-tecnico-team.vercel.app
  y SHA 7742eb24...; es ANTERIOR a R63 y solo referencia visual.

## 2. Contenido probado que debe publicarse, si se autoriza después

La CI #560 creó seis artefactos, entre ellos:
- cap-test-pro-commercial-preview (ZIP: 1.842.564 bytes);
- cap-r63-public-data-hash-manifest;
- cap-r63-public-package-browser;
- capturas de Focus y C22.

El build funcional validado incorpora:
- 8.655 preguntas del banco en 33 cuestionarios;
- 26 modelos históricos, 2.600 apariciones;
- 62 JSON de distribución y 41 informes editoriales eliminados de dist/data;
- SHA-256 inventario: 1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87;
- Chromium 390/430/768/1440 y caché PWA 66 rutas PASS;
- Focus 24 escenarios PASS.

La producción compartida, Supabase, scoring y main NO deben verse alterados.

## 3. Condición CRÍTICA: modo de construcción

El repo define:
- build: npm run prepare:data && tsc -b && vite build && verificación R63.
- build:preview: npm run prepare:data && tsc -b &&
  vite build --mode cap-preview && verificación R63.
- .env.cap-preview: VITE_CAP_PREVIEW=true.
- vite.config.ts: base raíz / SOLO en modo cap-preview (o serve);
  build normal usa /cap-test/ por defecto.
- src/App.tsx: VITE_CAP_PREVIEW=true habilita invitado local de prueba.
- src/main.tsx: Preview NO registra automáticamente el service worker.

**NO está confirmado por las lecturas de configuración disponibles el
buildCommand remoto efectivo del proyecto Vercel.** Un despliegue Git
normal que ejecute npm run build podría publicar assets con base /cap-test/
y sin el modo de pruebas. Está PROHIBIDO darlo por seguro sin inspección.

Antes de autorizar un despliegue verificar que el método de construcción:
1) ejecute el equivalente exacto de npm run build:preview;
2) entregue el artefacto de dist que ya superó la allowlist;
3) no cambie el build command persistente del proyecto ni los env vars
   de Production, Preview u otros proyectos;
4) no requiera mezclar el código de main;
5) no use archivos temporales con tokens dentro de Git o artefactos.
Una ruta posible es un build precompilado en un directorio temporal con
configuración efímera y deployment únicamente de Preview. **La viabilidad
de la ruta exacta aún debe verificarse antes de invocarla.**
La API de despliegues permite projectSettings.buildCommand, pero su
descripción indica que puede guardarse como configuración del proyecto:
NO usarlo en esta operación sin autorización específica para esa mutación.

## 4. Contrato para la futura publicación (aún NO AUTORIZADA)

- Una única Preview, no producción, no --prod, no dominio/alias
  de producción, no transferencia, no cambios de equipo ni de SSO.
- Proyecto destino por ID: prj_dXWmcfMTkLObA6JkwSz3mYtDoIbk;
  team: team_C7jTTBhmxsEP0pH8WiJDpfUO.
- Fuente: commit exacto 254298f8... validado; si se usa HEAD de rama
  con documentación adicional, verificar diff exclusivo docs antes de salir.
- Build modo cap-preview, base /, VITE_CAP_PREVIEW=true,
  panel invitado/datos locales, sin auth real ni sync.
- Validar READY y revisar el URL exacto del deployment, sin suponer éxito.
- Comprobar protección SSO desde una sesión sin autenticar,
  y acceso autorizado en PC + móvil.
- Comprobar peticiones a /, /data/index.json, /data/exams/index.json,
  /data/exams/frequency_by_bank.json, un fichero de cada índice,
  manifest.webmanifest, icon.svg y bundles JS/CSS: HTTP 200 autenticado.
- Comprobar que rutas editoriales conocidas como
  /data/exams/editorial_casebook_r23.json devuelven 404 (tras SSO).
- Comprobar presencia de 62 JSON, ausencia de los 41 informes, SHA
  de manifiesto y banner PREVIEW.
- En la prueba de producto verificar que el navegador no registre SW
  automáticamente. El ensayo de PWA se hizo por separado en CI.
- En ambos dispositivos revisar Inicio, regiones, banco, archivo
  Mercancías/Viajeros, top repetidas, simulacro, reloj,
  reanudación, exportación PDF y navegación responsive.
- Si falla cualquier puerta, NO pasar a producción ni cambiar protección;
  conservar la versión anterior READY y registrar la incidencia.

## 5. Alternativa física ya disponible sin despliegue

Descargar el artefacto cap-test-pro-commercial-preview del run #560;
descomprimir todo el ZIP, ejecutar INICIAR-PREVIEW.cmd en Windows
(requiere Python 3) y abrir http://127.0.0.1:4178/ solo desde ese PC.
No abrir file://index.html ni exponer el servidor loopback al exterior.
Para móvil con misma build se requiere Preview HTTPS autorizada, o
una LAN temporal aceptada explícitamente por el usuario; no asumirla.

## 6. Estado y autorización

R68 es solo un preflight/documentación; NO se ha ejecutado una operación
de despliegue ni alterado configuración de Vercel, Supabase o main.
PR #21 sigue OPEN DRAFT; el conflicto en public/sw.js persiste.
Última CI funcional #560 continúa válida al ser los cambios posteriores
únicamente documentales.

**R68: IDENTIDAD/SSO/CONTENIDO PREPARADOS.**
**BLOQUEO OPERATIVO PENDIENTE:** verificar un procedimiento de deploy
único que garantice cap-preview SIN modificar el buildCommand persistente.
**BLOQUEO DE AUTORIZACIÓN:** autorización explícita para ejecutar una
única Preview protegida antes de llamar herramientas mutativas.
