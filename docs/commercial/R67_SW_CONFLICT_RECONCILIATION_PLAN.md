# RutaCAP — R67: auditoría del conflicto de service worker y estrategia de reconciliación

**Fecha:** 20/11/2026. **Rama:** feat/cap-commercial. **PR:** #21 OPEN DRAFT.
**Base documental:** `9ac261d1866c41016b7b42e44ab40d1fcf05da88`.
**Último commit funcional con CI completa SUCCESS:** `254298f85afc487182a66e1030a6fa7ab36fdbd3`.
**Main observado:** `d91e59e9f0e648a558a3cbcd93b77fcec7e9612a`.

## Alcance

Solo comparación y planificación. **No se modifican service workers, main,
las respuestas, el scoring, la UI, Supabase, Vercel, producción o las
fuentes. No se hace merge ni despliegue.**

## Evidencias directamente verificadas

- La API de GitHub indica PR `mergeable=false`, `mergeable_state=dirty`.
- Base del PR: `d979ecac504f2099b885a2d2a371c070ef4fb808`.
- La única modificación en main desde dicha base es `public/sw.js`.
- La rama comercial también modificó `public/sw.js` desde esa misma
  base: es la única ruta compartida en las dos divergencias.
- GitHub Actions `Validate CAP Test` #560, ejecución
  `44633458463`, completada SUCCESS para el SHA funcional
  `254298f8`; 37/37 pasos de build correctos, sin merge.
- `R63 browser PASS` para 390/430/768/1440, archivo histórico 25+1,
  66 URLs necesarias en caché; `CAP Focus E2E PASS`, 24 escenarios.
- El producto comercial tiene `VITE_CAP_PREVIEW=true` en
  `.env.cap-preview`; `src/main.tsx` no registra el service worker en
  ese modo. La PWA sí fue probada explícitamente en un contexto aislado de
  Chromium desde el build de Preview por CI.

## Comparación funcional: tres versiones

| Aspecto | Main, 19/11 | Rama comercial |
|---|---|---|
| Base URL | `/cap-test/` fija | `new URL(self.registration.scope).pathname` |
| Prefijo de caché | `cap-test-` global antiguo | `cap-test-pro:<base>:` |
| Fetch de recursos | Network-first, `cache: no-cache` | Cache-first salvo navegación |
| Navegación | Network-first; conserva página offline | Network-first; conserva página offline |
| Errores >=500 | Puede recuperar copia de caché | Para recursos no navegacionales devuelve 5xx sin fallback |
| URLs auth/callback | Excluye code/error y Authorization | Excluye code/error y Authorization |
| Ruta sw.js | Ignora peticiones a sw.js | No tiene exclusión explícita |
| Límite de recursos cacheables | Toda ruta bajo /cap-test/ salvo excluidas | index/manifest/icon/assets/data y navegación |
| Limpieza de caché | Cachés con prefijo cap-test- | Cachés con prefijo comercial y ámbito |
| Precarga | 7 CORE, luego 33+26 JSON indexados | 7 CORE, luego 33+26 JSON indexados |

Main resuelve el problema que motivó la corrección PWA: evita
servir por defecto un JSON/bundle obsoleto con conectividad disponible.
La versión comercial previene mezclas de caché entre ámbitos Vercel (/)
y GitHub Pages (/cap-test/) y limita los recursos almacenables.
No se deben sustituir por entero ni aceptar una unión mecánica.

## Propuesta para una ronda posterior (NO implementada)

1. Partir del SW comercial, conservando BASE dinámico, prefijo de caché
   segregado y listas de recursos cacheables.
2. Aplicar **network-first** para índices, JSON de preguntas y assets
   estáticos permitidos, con revalidación `cache: no-cache`;
   preservar offline fallback del recurso cacheado ante error de red
   o 5xx. **No** servir caché obsoleta para 404/403.
3. Mantener la navegación network-first con shell offline y sin cachear
   consultas de OAuth, URLs de callback, credenciales o respuestas privadas.
   Excluir `sw.js` explícitamente.
4. Respetar prefijos y ámbitos al purgar cachés, y definir una migración
   deliberada de las cachés antiguas de main en /cap-test/ SIN eliminar
   cachés de otras aplicaciones/rutas.
5. Incrementar versión de caché comercial si el código cambia y comprobar
   activación del nuevo SW después de actualización en una instalación previa.
6. Validar un corpus **sintético** de recursos antes de ejecutar pruebas
   con el banco real. Conservar `build:preview` sin auto-registro SW
   para la inspección protegida de producto.

## Matriz mínima de pruebas para aceptar esa futura solución

- Rutas /cap-test/ (GitHub Pages) y / (Preview protegida).
- Primera instalación online y recarga online con recurso del servidor
  distinto del guardado en caché (debe ganar la red).
- Desconexión real, 5xx, 404, 401/403 y URL OAuth; no almacenar errores,
  respuestas autenticadas ni devolver archivos antiguos ante 404/403.
- Migración de una caché antigua `cap-test-` al nuevo prefijo,
  aislamiento de ámbitos, limpieza sin afectar otras PWA.
- Índices 33/26, 62 JSON allowlisted, 66 rutas de precarga,
  ausencia de CSV/JSON editoriales en dist, origen de respuestas intacto.
- Pruebas con Chromium móvil/escritorio y prueba manual en dispositivo real;
  la Preview de producto no debe registrar automáticamente un SW.
- Verificar CI de extremo a extremo en feature y, antes de merge, comprobar
  que el PR deja de estar `dirty` sin sobrescribir main.

## Decisión de R67

**Reconciliación: diseñada, NO ejecutada.** El PR sigue en DRAFT.
El paso siguiente requerirá autorización para cambiar el archivo
`public/sw.js` en la rama comercial y un procedimiento de resolución
de la divergencia con main, nunca un merge automático a producción.
