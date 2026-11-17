# C20 · CLM: seis retenciones, evidencia de origen y validación privada segura
**Fecha:** 17/11/2026 · **Rama:** `feat/cap-commercial` · **PR:** #21 DRAFT.

## Estado inicial
C19 validada: HEAD `d1a31d44a210e53b699b6ef0c246c8887516f055`, CI 6/6 SUCCESS. `main` intacta `d979ecac504f2099b885a2d2a371c070ef4fb808`. La rama R32 sigue independiente en PR #20 DRAFT. No se aprueba ninguna importación ni scoring en esta ronda.

## Evidencia documental privada y su límite
Se reabrió el archivo indexado privado `RutaCAP_C13_importacion_privada.json` a través de Files, no mediante copia binaria. Sus indicadores son `stageOnly=true`, `releaseAllowed=false`, `scoringAllowed=false`; 903 posiciones y 14 modelos. Los seis objetos `editorialHoldC13` conservan `scoringAllowed=false` y `releaseAllowed=false`. No se ha podido materializar la copia binaria de C13 en esta sesión y por tanto **no se afirma verificado de nuevo su SHA-256**.

Se compararon las preguntas retenidas con los PDF **originales provistos en la biblioteca del proyecto**: mayo 2026 «3ª prueba CAP 2026.pdf» páginas físicas 5 y 13; septiembre 2026 «CAP 2026 - Cuestionarios 5ª prueba.pdf» páginas físicas 5, 9, 30 y 32. En cinco páginas hubo imagen raster inspeccionable; mayo página 13 se confirmó por capa de texto extraída, sin declarar revisión de imagen de esa página. Las seis transcripciones C13 mantienen enunciado, opciones e identidad respecto al material disponible. El cotejo previo C19 de casillas iniciales de plantilla quedó 6/6, pero una clave **inicial** no demuestra su carácter final.

| Referencia privada | Letra inicial | Página cuestionario | Fuente/consideración | Estado |
|---|---:|---:|---|---|
| mayo Mercancías q29 | D | 5 | Hemorragia por boca, faltan condiciones de consciencia/vía aérea/traumatismos | HOLD |
| mayo Mercancías q85 | B | 13 | No retirar casco como norma general; guía DGT con supuesto de retirada necesaria y técnicas especializadas | HOLD |
| septiembre Mercancías q22 | B | 5 | RD 205/2025 art. 4 incluye costes de explotación, pero también construcción/desarrollo/conservación/mantenimiento | HOLD |
| septiembre Mercancías q48 | D | 9 | Repetición del supuesto clínico de mayo q29 | HOLD |
| septiembre Viajeros q32 | B | 30 | ONU 107 §7.5.7 regula determinadas puertas de vehículos homologados, no una orden universal de evacuación | HOLD |
| septiembre Viajeros q42 | A | 32 | DGT aporta pautas de evacuación, no verifica literalmente un barrido interior seguro en todas las circunstancias | HOLD |

**Interpretación segura:** no convertir el ejercicio de examen en instrucciones de actuación médica, evacuación o conducción para situaciones reales. No sustituir la letra impresa por opinión técnica, ni resolver estos holds con otra opción por inferencia. Se necesita revisión editorial y decisión final del tribunal o un criterio explicitado de no puntuación.

### Referencias de contraste (no equivalen a corrección del tribunal)
- DGT, asistencia ante siniestros: https://www.dgt.es/muevete-con-seguridad/que-hacer-ante-un-accidente-de-trafico/
- DGT, documento «La motocicleta», apartado de retirada de casco si fuese necesaria: https://www.dgt.es/export/sites/web-DGT/.galleries/downloads/conoce_la_dgt/que-hacemos/educacion-vial/adultos/no-formal/La_motocicleta.pdf
- RD 205/2025, artículo 4: https://www.boe.es/buscar/act.php?id=BOE-A-2025-5409#a4
- Reglamento ONU 107, apartado 7.5.7.1: https://www.boe.es/buscar/doc.php?id=DOUE-L-2026-80110
- DGT, evacuación de autobús: https://www-pro.dgt.es/muevete-con-seguridad/viaja-seguro/en-autobus/index.html
- Portal oficial CAP de Castilla-La Mancha: https://transporte.castillalamancha.es/actuaciones/certificado-de-aptitud-profesional-de-conductores-de-transporte-cap

## Finalidad de las plantillas y derechos de reutilización: dos barreras distintas
La ficha oficial publica las **plantillas correctoras** para las pruebas 3ª y 5ª de 2026 y también listados definitivos de personas aptas. La existencia de listas de resultados NO prueba por sí misma que no hubo cambios o anulaciones en las respuestas. No descargar listados con información de aspirantes ni inferir claves finales a partir de notas públicas. No se identificó documentalmente una **plantilla rectificada definitiva separada** de esos dos exámenes en las fuentes consultadas; registrar como **sin confirmación suficiente**, no como inexistente.

El aviso legal de la **sede electrónica** de la JCCM establece condiciones de reutilización, pero NO se ha demostrado que abarque de forma idéntica todos los PDF de `transporte.castillalamancha.es`, ni que el titular de los enunciados sea la Junta sin derechos de terceros. Ley 37/2007 contempla reutilización comercial sujeta a condiciones y límites, incluido derecho de terceros. Antes de venta o publicación del corpus pedir aclaración expresa acerca de (1) textos/opciones/reservas, (2) plantillas/soluciones, (3) atribución y modificaciones, (4) uso en una PWA comercial/suscripción, (5) documentos definitivos y eventuales rectificaciones. No iniciar trámites ni enviar mensajes sin decisión del propietario.
- https://www.jccm.es/aviso-legal
- https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814

## Guard de calidad de C13: **local y offline**
Archivo `scripts/audit_clm_private_stage_c20.py`. Requiere la **copia privada real** fuera del repositorio y comprueba antes de leer:
- SHA-256 del archivo `9dc09e69f7c96c40a1973ed90439eb7428a606ff448245e2a8a07448d5307cc0`;
- `sourceCorpusSha256` fijo `20b470761fcc1da5b9aa983e9df50d7cfc7bb2f048627b8cad6567673a3ac226`;
- 903 ocurrencias sin duplicados, 14 modelos (7 globales 103 posiciones cada uno y 7 promociones 26 posiciones cada uno), numeración y páginas;
- seis retenciones exactas, letras iniciales congeladas, `stageOnly=true`, prohibición total de `releaseAllowed`, `scoringAllowed` y migración de progreso;
- identidad protegida de mayo Mercancías q32 (`C`), 336 exactos legados, 64 legados cambiados sin migración, 454 candidatos exactos de banco, 42 nuevas/variantes y 7 múltiples.

**Nunca** imprime textos de preguntas, opciones, letras individuales, hashes nuevos o rutas privadas. Su resultado agregado no valida la exactitud del original, literalidad completa ni la legalidad de reutilización.

Ejecutar en ordenador privado, sobre archivo original suministrado de forma autorizada:

```bash
python3 scripts/audit_clm_private_stage_c20.py --input /ruta/privada/RutaCAP_C13_importacion_privada.json
```

En el CI público se ejecuta **únicamente** `python3 scripts/audit_clm_private_stage_c20.py --self-test` con 903 registros completamente sintéticos y perturbaciones para fallar cerrado. Nunca pasar la ruta privada como variable de CI, subir adjuntos o generar artefactos de preguntas.

## Restauración histórica: 62 NO significa 62 aprobadas
Los **62 candidatos** de C11 representan discrepancias concretas frente al histórico de Mercancías en una comparación anterior; no son los 62 casos ya cerrados del PR R29 histórico general y **tampoco** equivalen automáticamente a las 64 posiciones `legacy_changed_keep_old_progress_separate` de todo el stage privado C13. Sin la cola original de 62 accesible como contenido no se puede afirmar revisión individual ni aplicarlos por proximidad semántica. Requieren cotejo de página, modelo, letra por posición, texto literal y conservación de IDs/progreso.
Mayo Mercancías q32 se conserva con clave inicial **C** y nueva identidad separada de la pregunta histórica anterior; nunca reutilizar el progreso previo en este nuevo texto.

## Próximos gates
1. Verificar CI C20 synthetic guard, sin archivos privados; mantener PR #21 DRAFT.
2. Abrir archivo privado C13 original en entorno local autorizado y correr el guard de SHA + estructura; no proclamar «C20 SHA PASS» sin esta operación.
3. Localizar cola **privada** de 62 discrepancias C11 para cotejo literal uno a uno y registrar decisiones reversibles.
4. Solicitar al tribunal/JCCM última versión de plantillas, anulaciones/rectificaciones y condiciones de reutilización comercial de ambos tipos de documentos.
5. Mantener las seis retenciones sin puntuar y toda la fase CLM fuera del producto público.
