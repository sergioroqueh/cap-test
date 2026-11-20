# RutaCAP — R73 · Validación real de R71/R72 en GitHub Actions

Fecha: 20/11/2026.
Repositorio: sergioroqueh/cap-test.
Rama: feat/cap-commercial.
HEAD de entrada: 9d4646946535b66c5ef952aaf3047971f2e68524.
PR #21 OPEN DRAFT, mergeable_state=dirty por public/sw.js.
main comprobada: d91e59e9f0e648a558a3cbcd93b77fcec7e9612a.

## 1. Resultado oficial

GitHub Actions Validate CAP Test #561:
https://github.com/sergioroqueh/cap-test/actions/runs/44704718335

- Run ID: 44704718335
- Evento: workflow_dispatch (selección manual de feat/cap-commercial).
- Commit probado: 9d4646946535b66c5ef952aaf3047971f2e68524.
- Status: completed.
- Conclusion: success.
- Job build: 39/39 pasos SUCCESS, ninguno fallido u omitido.
- Siete artefactos, incluidos capturas R63/Focus, Preview empaquetada,
  manifiesto R63, diagnóstico R72, C22 y auditoría editorial.

## 2. R71: aviso contextual de Errores y Favoritos

La prueba real de Chromium scripts/e2e_r63_public_preview.mjs pasó con
los cuatro anchos 390/430/768/1440. Incluye los asertos añadidos en R71:
texto de los mensajes de Errores/Favoritos, posición inmediata debajo
de los accesos superiores y antes del configurador, visibilidad dentro
del viewport y cierre correcto. Log:

R63 browser PASS: 390, 430, 768, 1440 px; archive 25+1;
PWA 66 required URLs available in cache.

El resto del recorrido Focus supera 24 escenarios:
CAP Focus E2E PASS: 24 mobile/desktop scenarios.

R71 se considera validada en Chromium/CI. No se ha probado físicamente
en dispositivos del usuario, ni se ha desplegado el nuevo código.

## 3. Banco, scoring, empaquetado y fuentes

El empaquetador R63 funciona correctamente en build y build:preview:
62 JSON distribuidos, 8.655 preguntas y 33 cuestionarios, 26 modelos
históricos / 2.600 apariciones; 41 expedientes editoriales retirados
únicamente del paquete web; --verify PASS.
Pruebas de scoring, frecuencia, trazabilidad y R27-R31 integradas en
CI pasan. R33 R32 RECONCILIATION PASS: 128 casos, applied=0,
unchangedScorable=2382.

## 4. R72: informe read-only ejecutado en CI

Log:
R72 REPRO READ-ONLY: fileCount=62,
manifestSha256=1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87,
bankQuestions=8655, uniqueFingerprints=8200,
duplicatedBankFingerprintGroups=455,
historicalRowsWithMultipleCandidateIds=27,
postBuildMatchesWithoutProvenance=1,
selectedDiffersFromCodeSort=3.

Se descargaron ambos artefactos del run #561:
- cap-r72-reproducibility-diagnostics, ID 14614712057.
- cap-r63-public-data-hash-manifest, ID 14615046255.

Se compararon sus 62 pares (path, SHA-256): 62/62 idénticos.
Se contrastó además el manifiesto R63 de CI #561 con el de CI #560:
**62/62 hashes idénticos**, ninguna ruta distinta y la misma firma
global de 64 caracteres.

La divergencia contra el despliegue Vercel R70 persiste:
- GitHub #560 y #561: 1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87.
- Vercel R70: 5f2548b689e408101c76ad85e9beafb6f802d8a9076980683f2dc0ceb086a5b6.

No están disponibles los 62 hashes por archivo del despliegue
protegido R70; **no hay atribución causal demostrada**. El glob
no ordenado y original=matching[0] son una fuente plausible, no
una explicación confirmada. No se cambia el generador ni los IDs,
respuestas, scoring, frecuencia o historial por conjetura.

## 5. Estado de Vercel y límites

La Preview protegida R70 sigue READY:
dpl_8rwgBtqjSeRf3XocG32fZR9Jx8nH
https://cap-test-pruebas-gghnxcwsd-cuaderno-tecnico-team.vercel.app
Commit desplegado: 254298f85afc487182a66e1030a6fa7ab36fdbd3,
anterior a R71. **La corrección visual R71 no está publicada.**

R73 no hizo cambios de aplicación, banco, CI, SW, scoring,
Supabase, main ni ajustes Vercel. No hizo merge ni despliegue.
La única modificación de R73 es este documento.

## 6. Siguiente puerta

R74: preparar, sin ejecutar sin autorización, una Preview protegida
que incorpore el HEAD validado #561 para ver la corrección R71 en
PC y móvil, manteniendo cap-preview y la regla persistente
Ignored Build Step. En paralelo, diseñar una prueba de hashes entre
entornos compatible con SSO sin generar enlaces de acceso público.
El conflicto public/sw.js del PR permanece pendiente de resolución
deliberada.

**R73: VALIDACIÓN CI PASS; diferencia de hashes Vercel abierta.**
