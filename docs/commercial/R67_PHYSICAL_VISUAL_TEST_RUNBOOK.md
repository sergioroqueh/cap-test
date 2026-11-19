# RutaCAP — R67: preparación de prueba visual física (PC + móvil)

**Fecha:** 20/11/2026. **PR:** #21 OPEN DRAFT.
**Alcance:** documento operativo y preflight, no despliegue.

## Evidencias verificadas

- GitHub Actions #560: https://github.com/sergioroqueh/cap-test/actions/runs/44633458463
- SHA funcional validado: `254298f85afc487182a66e1030a6fa7ab36fdbd3`.
- Job build: 37/37 PASS; 6 artefactos. El ZIP
  `cap-test-pro-commercial-preview` tiene 1.842.564 bytes comprimidos.
- CI real: 8.655/33, 26 modelos/2.600 preguntas, allowlist 62 JSON y
  41 informes editoriales retirados solo de dist; hash del manifiesto:
  `1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87`.
- Chromium: 390/430/768/1440 PASS, 25+1 en archivo, PWA 66 rutas
  precargadas en contexto aislado, Focus 24 escenarios PASS.
- Vercel: equipo `cuaderno-tecnico-team`, proyecto `cap-test-pruebas`,
  framework Vite, Node 22.x, `ssoProtection.enabled=true`,
  `deploymentType=all_except_custom_domains`.
- Preview antigua READY: deployment
  `dpl_HWCmVwKBFr4KRs9vrm3oHqiuwQMG`, URL inmutable
  https://cap-test-pruebas-pzjrluat6-cuaderno-tecnico-team.vercel.app
  y Git SHA `7742eb24...`. **No contiene R63-R66.**
- Los intentos automáticos más recientes de Vercel en feature aparecen
  `CANCELED`. No se ha creado Preview nueva de R63–R66.
- `.env.cap-preview` tiene `VITE_CAP_PREVIEW=true`.
  `build:preview` emplea `vite build --mode cap-preview` con
  `BASE_URL=/` y post-verificación allowlist. `src/main.tsx`
  desactiva el registro automático de SW en Preview.

## A. Prueba física inmediatamente disponible en PC, SIN despliegue

1. Abrir GitHub Actions run #560 y descargar artefacto
   **cap-test-pro-commercial-preview** (ZIP):
   https://github.com/sergioroqueh/cap-test/actions/runs/44633458463
2. Descomprimir todo el ZIP en una carpeta nueva y separada.
   No abrir index.html directamente como file://.
3. En Windows, ejecutar `INICIAR-PREVIEW.cmd`, generado por CI,
   que lanza Python 3 en `127.0.0.1:4178`.
   Alternativa desde la carpeta descomprimida:
   `py -3 -m http.server 4178 --bind 127.0.0.1`.
4. Visitar http://127.0.0.1:4178/ desde el PC.
   No abrir puertos en el router ni exponer carpetas o credenciales.
5. Confirmar banner `PREVIEW`, `Datos locales · Sin sincronización`.
   La prueba utiliza progreso local del navegador; no probar
   autenticación o sincronización reales.
6. Cerrar con Ctrl+C y conservar ZIP original sin modificar.

Esta prueba usa **exactamente el dist que superó CI** y no pasa por Vercel.
El servidor ligado a loopback no es accesible desde otros dispositivos;
eso es deliberado. No convertirlo silenciosamente en servidor público.

## B. Prueba visual móvil con la versión nueva

**Preferencia:** único despliegue de Preview HTTPS con Vercel Authentication
activa, solo tras autorización explícita y comprobación de proyecto,
equipo, commit y comando. La Preview anterior sirve únicamente
para comparación visual; no demuestra R63.

Preflight exigido ANTES de cualquier futuro deploy:
- Equipo `cuaderno-tecnico-team`, proyecto `cap-test-pruebas`.
- Objetivo `preview`, NO producción, NO `--prod`, sin cambios de dominio
  ni alias del sitio operativo.
- Build `npm run build:preview`, raíz `/`, variable
  `VITE_CAP_PREVIEW=true`, sin acceso real a cloud ni Supabase.
- Respetar protección SSO y evitar cualquier bypass público.
- Compilar el commit funcional aprobado o HEAD con **solo documentos
  posteriores**, verificando su equivalencia de código.
- Una URL de despliegue inmutable, sin promover ni fusionar.
- Comprobaciones HTTP autenticadas de índices, preguntas, frecuencia,
  manifest, assets y `sw.js`; 404 para expedientes editoriales.
  En la Preview de alumno no registrar SW automáticamente.

Como alternativa solo para pruebas visuales, puede usarse un servidor
LAN temporal con el ZIP y móvil en Wi-Fi de confianza, previa elección
consciente de exponer esos archivos a dicha LAN. Esta opción NO
equivale a prueba PWA segura ni permite validar HTTPS/SSO.

## C. Checklist de comprobación física

Registrar dispositivo/modelo, sistema, navegador, ancho útil,
fecha, origen del build y URL; conservar fotos sin datos privados.

| Área | Acciones en PC y móvil | Criterio |
|---|---|---|
| Entrada y estética | Abrir desde sesión nueva, revisar cabecera, botones, márgenes y esquinas | Sin desbordamiento horizontal, recortes ni saltos |
| Portada | Abrir Inicio, tarjeta Banco, accesos Errores/Favoritos/Más repetidas/Simulacro | Números visibles y botones pulsables |
| Región | Abrir, recorrer y cerrar selector de comunidades; cambiar preferencia | 19 opciones, foco y desplazamiento correctos |
| Banco general | Entrar al banco, abrir Crear test, elegir 30 preguntas | Banco de 8.655 accesible |
| Archivo | Abrir Por convocatoria, seleccionar Mercancías y luego Viajeros | 25 modelos Mercancías + 1 Viajeros, no habilitar el no puntuable |
| Examen | Comenzar simulacro histórico de 100, marcar respuestas y revisar | 100 preguntas, reloj y reanudación funcional |
| Estudio | Respuesta correcta/incorrecta, frecuencia y trazabilidad | Feedback legible sin saltos visuales |
| Top repetidas | Abrir y cerrar popup Top 100 / >=3 / >=4 | Modal usable en móvil, scroll correcto |
| Persistencia | Recargar tras guardar test; volver a la pantalla inicial | Continuar sin borrar respuestas ni reiniciar reloj |
| PDF | Exportar test y hoja de soluciones, abrir/compartir | PDF completo con cuadrícula legible |
| Perfil | Preferencias, tema claro/oscuro, navegación y botón atrás | UI consistente en ambos tamaños |
| Conectividad | Con conexión disponible, recargar índices y navegación | Sin pantalla vacía ni assets rotos |
| Consola/red | Ver errores 4xx/5xx y solicitudes a terceros cuando sea viable | Sin fallos de assets, sin cloud real |

**Importante:** la Preview `cap-preview` desactiva el SW automático.
La prueba del comportamiento offline PWA propiamente dicho corresponde
a la suite de Chromium CI, y una futura ronda controlada de SW,
no a una falsa prueba desconectando la Preview protegida.

## D. Evidencias manuales a guardar

- Capturas de Inicio, archivo de Mercancías/Viajeros, pregunta,
  resultado, PDF y Perfil, en escritorio y móvil.
- Imagen del encabezado antes/después de recarga, y del selector
  de región con scroll.
- Una hoja de incidencias por pantalla: dispositivo, acción,
  resultado esperado, resultado observado y severidad
  BLOQUEANTE / FUNCIONAL / VISUAL / COSMÉTICA.
- No incluir contraseñas, tokens, datos de sesión Vercel ni
  información personal identificable.

## E. Puerta de salida

- PC local: puede probarse desde ZIP actual sin autorización de
  despliegue.
- Móvil de la **misma versión:** esperar una Preview HTTPS
  protegida autorizada, o decidir explícitamente un LAN temporal.
- Nada de esta ronda modifica `main`, producción, SW, scoring,
  banco, R58, Supabase o la protección Vercel.

**Estado: R67 PRUEBA FÍSICA PREPARADA, NO EJECUTADA EN DISPOSITIVOS
DEL USUARIO, SIN NUEVO DESPLIEGUE.**
