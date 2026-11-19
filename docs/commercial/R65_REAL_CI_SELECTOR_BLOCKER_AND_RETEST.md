# RutaCAP — R65: CI manual real, fallo en selector heredado y ajuste limitado de pruebas

Fecha: 19/11/2026. PR #21 OPEN DRAFT, sin merge.
Ronda anterior R64: `6377a96d896ef7be13c92be095c7e9ce457b5faf`.
Run manual real: https://github.com/sergioroqueh/cap-test/actions/runs/44632366970
Job: `build` (135942063341); resultado global `failure`.

## Resultado observado en GitHub Actions

La ejecución manual `workflow_dispatch` sí arrancó sobre
`feat/cap-commercial`, a pesar del PR `mergeable_state=dirty`.
El error de integración del PR no impide la compilación manual.

**PASS antes de la interrupción:**

- `npm ci`; runner portable; test allowlist R63 sintético.
- `npm run build`: banco 8.655 preguntas / 33 cuestionarios, 26
  modelos / 2.600 apariciones, TypeScript y Vite.
- Empaquetado R63 `package OK`: exactamente 62 ficheros publicados,
  **41 ficheros editoriales excluidos de dist**, manifest SHA-256:
  `1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87`.
- `--verify` PASS; los expedientes R23 permanecen en public y están
  ausentes del bundle final.
- Motor de scoring, tiempo, frecuencia Top 100, procedencia de
  respuestas, aislamiento de datos y pruebas editoriales R27-R31 PASS.
- `npm run build:preview` PASS; hashes coincidentes con el build anterior.
- Chromium instalado, catálogo privado denegado correctamente,
  catálogo sintético PASS y autenticación invitada C22 navegador PASS.

**Fallo único que interrumpió la ejecución:** paso
`Test Focus UI in mobile and desktop browsers`. Archivo
`scripts/e2e_cap_focus.mjs`, línea 461; Playwright timeout tras
30 segundos intentando encontrar:
`nav button` con texto `Test general`.
Es un selector de UI anterior, no una conclusión de que el banco esté roto.
En `src/App.tsx` la navegación actual se llama `Crear test` y el
botón del formulario `Comenzar test`, frente a los nombres antiguos
`Test general` y `Comenzar simulacro`.

Los pasos siguientes (E2E específico R63, ZIP y evidencias de CI, R32)
quedaron **skipped** por el error anterior; no debe declararse CI global PASS.
Las capturas C22/Focus se exportaron (2 artefactos), pero la captura
específica R63 no llegó a generarse.

## Ajustes realizados sin tocar producto ni datos

1. `scripts/e2e_cap_focus.mjs`: corregidos exclusivamente los dos
   selectores obsoletos usando el texto de la UI actual y la navegación
   accesible `Navegación principal`.
2. `.github/workflows/ci.yml`: el servidor local de Preview se
   inicia una vez antes de las pruebas de navegador; primero corre el
   chequeo específico R63 (390, 430, 768, 1440 y PWA) y después Focus.
   Así una falla posterior de Focus no impide ver la prueba R63.
3. Conservación del manifiesto SHA-256 como artefacto aun cuando la CI
   no termine completamente, mediante `if: always()` en esa subida.

Ningún cambio a `src/`, `public/sw.js`, respuestas, scoring,
preguntas, fuentes, Supabase, main, protección de Vercel o producción.
Sin merge, sin deploy. R58 READY protegida permanece intacta.

## Próximo paso

Ejecutar **una nueva** ejecución de **Validate CAP Test** con
`workflow_dispatch` sobre `feat/cap-commercial` y su nuevo HEAD;
NO utilizar `Re-run jobs` del run anterior, porque repetiría el SHA
y los selectores antiguos. Consultar los logs y los artefactos SHA,
capturas responsive/PWA y archivo histórico. Si hay más fallos, resolver
únicamente comprobadores de CI/test o defectos R63 demostrados.
