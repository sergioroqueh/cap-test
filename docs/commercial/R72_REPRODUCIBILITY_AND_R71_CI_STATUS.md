# RutaCAP — R72: diagnóstico CI R71 y SHA-256 entre GitHub y Vercel

Fecha: 20/11/2026. Rama feat/cap-commercial, PR #21 OPEN DRAFT sin merge.
HEAD de partida: 9fe2aa1a06248ebf0f7dc4b57738800894927646.
Commit R71 funcional: a639e1347629cd46bf5087ca750e866854cf4600.
Main: d91e59e9f0e648a558a3cbcd93b77fcec7e9612a, intacta.

## 1. Estado de CI de R71

La consulta a GitHub Actions no devuelve ninguna ejecución para el SHA
funcional a639e134... ni el HEAD documental 9fe2aa1a... La última
CI integral, Validate CAP Test #560, SUCCESS 37/37, corresponde a
254298f8, anterior a R71. Por tanto la corrección visual R71
NO se considera validada en Chromium.

El PR sigue mergeable_state=dirty por public/sw.js. La vía segura
es ejecutar manualmente el workflow Validate CAP Test, mediante
workflow_dispatch, seleccionando feat/cap-commercial. No se ha disparado
ningún workflow ni deployment durante R72.

## 2. Evidencia de integridad del artefacto CI #560

Se descargaron dos artefactos reales desde GitHub:
- cap-test-pro-commercial-preview, 1.842.564 bytes ZIP.
- cap-r63-public-data-hash-manifest, 3.105 bytes ZIP.

La reconstrucción independiente en Python del SHA-256 de todos los
archivos del ZIP coincide con el inventario de CI: 62/62 archivos,
0 diferencias. Hay 33 cuestionarios y 26 archivos históricos, sin
documentos editoriales incluidos en dist.

SHA256 global del manifiesto CI #560:
1e8d56f291f4382a865dee8735905539893af91c1bc464bcb80a25d10cd9ca87

## 3. Contraste con Vercel R70

Deployment dpl_8rwgBtqjSeRf3XocG32fZR9Jx8nH: READY, protegido.
URL https://cap-test-pruebas-gghnxcwsd-cuaderno-tecnico-team.vercel.app
Vercel ejecutó npm run build:preview, empaquetó exactamente 62 JSON y
excluyó 41 expedientes editoriales.

SHA256 global del manifiesto Vercel R70:
5f2548b689e408101c76ad85e9beafb6f802d8a9076980683f2dc0ceb086a5b6

Estos hashes NO coinciden. La allowlist R63 garantiza la igualdad
public/data vs dist/data dentro de una misma compilación, NO
equivalencia binaria entre GitHub Actions y Vercel.

Todavía no tenemos los 62 hashes individuales de Vercel. No se
ha creado un enlace temporal de acceso compartido que pudiera
ampliar el acceso a una Preview protegida.

## 4. Fuente de variación potencial identificada

En scripts/build_exam_data.py se usa glob('*.json') sobre el banco
original sin ordenación explícita. Posteriormente se usa
original=matching[0] para conservar un vínculo previo con el banco.
La función select_frequency_bank_match selecciona de manera estable
la identidad del grupo de frecuencia, pero NO sustituye ese vínculo.

El análisis del ZIP de CI #560 encontró:
- 8.655 preguntas, 8.200 huellas normalizadas distintas.
- 455 grupos duplicados de enunciado + cuatro opciones.
- 27 apariciones históricas con más de un vínculo bancario posible y
  una única respuesta candidata, cuyo vínculo publicado es válido.
- 3 de esas 27 seleccionan un vínculo distinto del menor código/ID.
- 1 aparición adicional encuentra candidatos al comparar el texto
  publicado, pero sin vínculo bancario en la fuente generada. No
  debe vincularse a posteriori por posibles cambios de visualización.

La existencia de esos 27 casos es evidencia de sensibilidad potencial
al orden del sistema de archivos. NO confirma todavía que esos sean
los archivos que difieren entre Vercel y CI, ni autoriza cambiar IDs.

## 5. Instrumentación de auditoría añadida (solo lectura)

- Nuevo scripts/audit_r72_reproducibility.py, que lee un ZIP o dist
  y registra SHA por cada ruta, ambigüedades y manifiesto R63.
- Opción --reference para comparar dos manifiestos y enumerar las
  rutas de bytes diferentes cuando estén disponibles.
- CI actualizada para ejecutar el auditor tras build:preview y
  guardar artifacts/r72-public-data-diagnostics.json como artefacto
  cap-r72-reproducibility-diagnostics.
- No modifica datos fuente, preguntas, correcciones, scoring, ni
  contenido de public/ o dist/. Se ha probado un prototipo con el
  ZIP de CI #560; la versión integrada en CI queda pendiente.

## 6. Siguientes puertas y restricciones

1. Ejecutar Validate CAP Test manualmente en feat/cap-commercial
   (nueva ejecución, no Re-run de #560).
2. Revisar E2E R71 de Errores/Favoritos y los cuatro anchos;
   comprobar también PWA, archivo y Focus.
3. Recuperar inventario Vercel por un medio autorizado SIN debilitar
   autenticación. Comparar individualmente las 62 rutas.
4. Si se confirma la hipótesis, proponer una ronda separada de
   corrección determinista con pruebas de impacto en progreso,
   favoritos, origen y puntuación; NO cambiar el generador en R72.

La Preview R70 READY sigue en commit 254298f8, sin R71;
no hubo nuevo despliegue. Main y SW intactos, PR sin merge.
**R72: DIAGNÓSTICO INSTRUMENTADO; CI R71 AÚN PENDIENTE.**
