# C21 · Reconstrucción controlada de 62 candidatos CLM y comparación con histórico
**Fecha:** 17/11/2026. **Base:** C20 HEAD `77d0237726fc5e0ebad37f741c3a85d2df46b8b8`, PR #21 DRAFT; `main` `d979ecac504f2099b885a2d2a371c070ef4fb808` intacta.

## Verificaciones de entrada
C20 CI confirmado **6/6 SUCCESS**, incluido C7 `44062783208`, Validate CAP Test `44062783189` y la prueba sintética `C20 SELFTEST PASS`. PR #20 de R32 sigue independiente DRAFT sin cambios.
Documentos de contexto, hoja de ruta y prioridades leídos del Proyecto. La política sigue siendo no divulgar corpus privado, no fusionar, publicar, cambiar puntuaciones, conectar servicios ni generar gastos.

## Custodia privada: qué fue posible acceder realmente
Se recuperó **texto indexado** de `RutaCAP_C13_importacion_privada.json` por 23 tramos (22.524 líneas) y se reconstruyó un objeto JSON legible localmente: 903 posiciones, 903 IDs únicos, 14 modelos, tres flags globales `stageOnly=true`, `releaseAllowed=false`, `scoringAllowed=false`, seis holds y en **las 903 filas** `scoringAllowed=false`, `releaseAllowed=false`, `progressMigrationAllowed=false`. **Los bytes originales del JSON C13 no se pudieron materializar**; el SHA-256 publicado `9dc09e69f7c96c40a1973ed90439eb7428a606ff448245e2a8a07448d5307cc0` **NO** se volvió a verificar. La reconstrucción indexada no equivale al original firmado ni al raw byte stream.

Se materializaron **sí** los cuestionarios PDF originales de 2026 desde la biblioteca privada y se comparó directamente su SHA-256 con el campo `sourceHash` del C13:
- 3ª prueba (mayo): `a99e67b195eb245e1ae150e692a5cfafb2f6958c5b1401f4bf69344b8c159d64` — **igual**.
- 4ª prueba (julio): `d1220c44c21d784487c3b6792eb45bce130088b5b9bf038d13712a03d4df9244` — **igual**.
- 5ª prueba (septiembre): `daf0d2646c93c1c73734e6437f234d96052998c12557c6003008e1eed3ef6f70` — **igual**.

Los PDFs de *plantillas correctoras* no estuvieron disponibles como bytes originales en esta sesión, por lo que sus hashes/finalidad siguen pendientes, sin deshacer el cotejo visual anterior de seis letras iniciales.

## Comparativa C13 frente al preview histórico C19
Se usó **solo en trabajo privado**, sin subir datos a GitHub, el ZIP de preview C19 (SHA-256 `567d7b5e28c647e4f01368f944e710d61cf2a6185f1015d1c006b1845273c8ef`), con los 400 registros principales históricos de Mercancías de mayo, julio A/B y septiembre, comparados por modelo y número con la fase privada C13.

| Modelo | `legacy_changed_keep_old_progress_separate` C13 | C11 documentados |
|---|---:|---:|
| Mayo Mercancías A | 35 | 35 |
| Julio Mercancías A | 4 | 3 |
| Julio Mercancías B | 5 | 4 |
| Septiembre Mercancías A | 20 | 20 |
| **TOTAL** | **64** | **62** |

Las dos adicionales son **julio A 56** y **julio B 71**, ambas reparadas durante C12 por corte de enunciado/alternativa, **sin cambio de letra B**. Se cotejaron visualmente con las imágenes de páginas físicas 10 y 29 del PDF original de julio, mostrando el texto corrido y la separación correcta de opciones.

**Advertencia:** no se recuperó el archivo original de la cola privada de C11. Los **62 elementos son una reconstrucción fuertemente apoyada** en los conteos C11, identidades C13 y exclusión de esas dos reparaciones C12; NO afirmar que el JSON reconstruido sea una copia exacta de la cola C11.

## Clasificación individual sin aplicación de cambios
- 400 posiciones contrastadas. **94** diferencias de texto exacto entre stage C13 e histórico C19.
- **64** con estado de identidad cambiada en C13; **30** variantes adicionales que cambian bytes/formato pero son iguales al normalizar acentos, signos y caracteres alfanuméricos (no equivalen automáticamente a revisión pixel a pixel).
- De las 64: **1** conflicto claro de identidad/letra (mayo M32); **9** con texto de alternativa correcta distinto tras normalización; **2** reparaciones de corte de maquetación (julio A56/B71); **44** con otras variantes de contenido y **8** predominantemente tipográficas. Son categorías de **triage**, no decisiones de scoring.
- **10/64** cambian el texto normalizado de la opción históricamente seleccionada, incluida mayo M32; **1/64** cambia la letra nominal aplicada (M32) **porque es otro enunciado**.
- Mayo M29: la alternativa C histórica contiene un añadido de texto que **no figura** en el cuestionario original; no modificar ni declarar su respuesta clínicamente segura. Mayo M32: el original trata de extinción por agua, mientras la pregunta histórica es completamente distinta; **nunca reusar ID ni progreso**.
- Para los **44** candidatos de mayo/julio se confirmó la existencia del número de pregunta en la página indicada del PDF con capa de texto, tras comprobar el SHA real. Para los **20** candidatos de septiembre el PDF original está escaneado: hash/páginas verificados, pero no se atribuye PASS literal por análisis de texto automático. Se inspeccionaron visualmente los recortes de septiembre M6, M32, M44 y M58 (respuesta seleccionada e identificación) y se confirmó la referencia al cuestionario original; NO extrapolar a los restantes 16. Sin OCR.

Los detalles de las 64 diferencias (old/new de enunciados y alternativas, claves, páginas, índices, flags, clasificación y 30 variantes extra) permanecen exclusivamente en el archivo **privado de conversación** `RutaCAP_C21_comparativa_privada_64.json`, SHA-256 `c4c49706ac65c4faeedfb7d66f21547143f7b2c702d21e4281b19ab40dc05863`. Existe resumen sin texto de preguntas `RutaCAP_C21_resumen_sin_preguntas.json`, SHA-256 `37eb79eb4ec8effeba8030e630a266033480ca3978b849edd482b95079f626dc`. **NO** copiar esos datos completos al repositorio público, issues, PR, logs, artefactos ni endpoints.

## Fuentes oficiales y derechos (C21)
El portal CAP CLM muestra los pares de **cuestionarios y plantillas correctoras de las pruebas 3ª, 4ª y 5ª de 2026**, junto a listados definitivos de personas aptas; muestra también documentación previa de una 6ª prueba, no un par completo de cuestionario+plantilla publicado en lo consultado. No confundir «lista de aprobados definitiva» con «plantilla rectificada de respuestas».
- https://transporte.castillalamancha.es/actuaciones/certificado-de-aptitud-profesional-de-conductores-de-transporte-cap
- https://www.jccm.es/aviso-legal

El aviso legal de la sede JCCM contiene condiciones generales de reutilización (citar fuente, no desnaturalizar, fecha de publicación y derechos de terceros). **No se ha probado** que esas condiciones cubran sin restricciones los documentos del subdominio de Transportes ni la eventual titularidad ministerial de preguntas. Una licencia del portal nacional NAP o del portal de datos abiertos no se puede aplicar por analogía a estos PDF. Solicitar confirmación escrita acerca de titularidad, opciones/preguntas, reservas, plantillas, suscripciones y posibles rectificaciones antes de beta o publicación. No se han descargado listados de aspirantes, ni enviado correos o solicitudes.

## Barreras y siguiente ronda C22
1. **Ninguna** de las 64 restauraciones se ha aplicado al corpus, respuestas o progreso. Las seis retenciones C13 siguen no puntuables y no publicables; `main`, producción y PR #20 intactos.
2. Recuperar bytes del JSON C13 original autorizado para ejecutar íntegro `scripts/audit_clm_private_stage_c20.py --input ...` (sin `--self-test`); el stage reconstruido NO sustituye la verificación SHA.
3. Auditoría **literal de 64 candidatos + 30 variantes de formato**, priorizando M32, las nueve alternativas correctas diferentes y las veinte posiciones de septiembre escaneadas. Conservar imágenes de evidencia sólo en espacio privado. Verificar reservas y modelos permutados.
4. Cotejar actos de alegaciones/rectificaciones definitivas con la **clave inicial** y obtener permiso o aclaración de reutilización comercial.
5. Solo después preparar propuestas de importación individual reversible en entorno privado, con ids nuevos donde cambie contenido y `scoringAllowed=false` hasta aprobación explícita.
