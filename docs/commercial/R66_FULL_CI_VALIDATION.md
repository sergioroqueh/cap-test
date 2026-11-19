# RutaCAP — R66: validación integral confirmada por CI

Fecha de cierre: 20/11/2026 (ejecución del 19/11 UTC).
Repositorio: sergioroqueh/cap-test.
Rama: feat/cap-commercial.
PR #21: OPEN DRAFT, sin merge.
**Commit validado:** `254298f85afc487182a66e1030a6fa7ab36fdbd3`.

## Fuente verificable

- Workflow: Validate CAP Test #560
- ID: `44633458463`
- URL: https://github.com/sergioroqueh/cap-test/actions/runs/44633458463
- Evento: `workflow_dispatch` (ejecutado manualmente en la rama comercial).
- Resultado: `completed/success`.
- Job `build` #135945875990: **37/37 pasos SUCCESS**, sin pasos omitidos.
- Artefactos publicados en GitHub Actions: **6**.

## Evidencia técnica obtenida de los logs reales

1. `npm ci`, runner multiplataforma, scripts sintéticos R63: PASS.
2. Compilación `npm run build` con `prepare:data`, TypeScript y Vite: PASS.
3. Banco original: **8.655 preguntas / 33 cuestionarios**: PASS.
4. Archivo histórico: **26 modelos / 2.600 apariciones**: PASS; pruebas de
   elegibilidad y puntuación ejecutadas sin modificar sus claves.
5. `package_public_data_r63.mjs`: PASS. Allowlist de **62 JSON** conservados.
   Se retiran exclusivamente **41 informes editoriales reconocidos** de
   `dist/data`, conservándolos en `public/data` para auditoría.
6. Hash SHA-256 del manifiesto de los 62 archivos, idéntico en ambos
   builds:
   `1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87`.
   `--verify`: PASS en ambos builds.
7. Trazabilidad de respuestas, controles del scoring, reloj y frecuencia
   Top 100; auditorías técnicas R27-R31: PASS.
8. `npm run build:preview`: PASS. El modo de catálogo editorial privado
   sigue rechazando compilación; su prueba aislada sintética pasa.
9. Navegador Chromium C22: PASS (entrada, invitado, salida, error de callback,
   capturas móvil y escritorio).
10. Navegador Chromium R63: **PASS** en anchos **390, 430, 768 y 1440 px**;
    archivo histórico **25 Mercancías + 1 Viajeros**; las **66 rutas**
    requeridas por la PWA están en caché. No se precargan expedientes editoriales.
    Log: `R63 browser PASS: 390, 430, 768, 1440 px; archive 25+1; PWA 66 required URLs available in cache`.
11. Navegador Chromium Focus: **24 escenarios móvil/escritorio PASS**.
    Log: `CAP Focus E2E PASS: 24 mobile/desktop scenarios`.
12. Comprobación final R32/R33: `R33 R32 RECONCILIATION PASS`,
    128 casos, **applied=0**, 2.382 apariciones puntuables sin cambio.

## Artefactos producidos

- `cap-test-pro-commercial-preview` (1.842.564 bytes):
  salida de compilación **solo como artefacto CI**; NO desplegada.
- `cap-r63-public-data-hash-manifest` (3.105 bytes).
- `cap-r63-public-package-browser` (1.049.272 bytes).
- `cap-focus-mobile-desktop-screenshots` (7.303.277 bytes).
- `cap-c22-auth-guest-screenshots` (896.881 bytes).
- `cap-exam-review` (1.039.816 bytes).

## Advertencia no bloqueante

GitHub muestra una advertencia de deprecación de Node.js 20 para
`actions/checkout@v4`, `actions/setup-node@v4` y
`actions/upload-artifact@v4`, que el runner fuerza temporalmente a
Node.js 24. Esta advertencia **no provocó fallos** en la ejecución #560.
Una futura ronda podrá revisar versiones de Actions con enfoque de
reproducibilidad, sin mezclarlo con el cierre R66.

## Estado de seguridad y límites

El PR #21 continúa `mergeable_state=dirty`, por el conflicto previo entre
`public/sw.js` de main y el de la rama comercial. La ejecución manual
demuestra que se puede validar la rama sin resolverlo; **no** permite
concluir que el PR pueda fusionarse sin revisión.

El repositorio fuente sigue siendo público. La exclusión de informes
editoriales de `dist/data` no privatiza las fuentes o el historial de Git.
El resultado PASS valida el artefacto de distribución, no la confidencialidad
de todo el repositorio.

**R66 no modifica código, datos, scoring, preguntas, service worker, Supabase,
main, Vercel ni producción. No se ha hecho merge ni despliegue.** R58 continúa
READY protegida.

## Siguiente decisión

R67 puede centrarse en una auditoría y plan aislado de reconciliación de
`public/sw.js` (network-first de main frente a SW de ámbito dinámico en
la rama comercial), **sin tocar main ni realizar merge automático**.
Alternativamente se puede preparar una futura Preview protegida;
requiere autorización específica de despliegue conforme a las restricciones.

**R66: CI INTEGRAL SUCCESS.** No hay bloqueos de compilación pendientes
en el HEAD validado; persiste exclusivamente el conflicto de integración.
