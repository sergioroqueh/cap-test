# R33 — Reconciliación editorial R32 por metadatos · 18/11/2026

## Decisión autorizada y límites

Aprobación del propietario el 18/11/2026: política dual de recurrencias y **únicamente** reconciliación editorial acotada en `feat/cap-commercial`. No se modifica `main`, banco, enunciados, opciones, plantillas, scoring, interfaz, nube, Supabase real, pagos ni despliegue. PR #21 permanece DRAFT.

La etiqueta de recurrencia de pregunta se entiende como número de **modelos oficiales** que presentan el mismo enunciado y la misma solución textual, aunque cambien los distractores, **siempre que la equivalencia esté demostrada**. La variante exacta cuenta el enunciado y el multiconjunto de cuatro opciones normalizadas, sin contar el orden de presentación. Las **fechas distintas** son una tercera medida, no intercambiable con modelos. Esta decisión **no autoriza** agrupar globalmente por enunciado ni modificar otras familias; la semántica podrá requerir revisión normativa por fecha. No se añade por ahora ninguna segunda métrica a la UI ni se recalcula todo el Top 100.

## Procedencia e identidad

- R32 congelado: `data-src/cap-exams/technical_review_r32.json` (**no editar**); Git blob SHA `fd8fa3c1113dab8c495282f1982dc627a05e584c`.
- Selección original: [GitHub Actions #43899580500](https://github.com/sergioroqueh/cap-test/actions/runs/43899580500), commit `35b56bf5a7ad65c218126db05973460091a4112d`.
- Selección posterior a C23: [GitHub Actions #44345161433](https://github.com/sergioroqueh/cap-test/actions/runs/44345161433), commit `9c19f1c05dbf7bd1805691d4a62128791a15b8da`.
- Investigación READ-ONLY: [comentario diagnóstico PR #21](https://github.com/sergioroqueh/cap-test/pull/21#issuecomment-6984729874).
- Contrato de diferencias explícitas: `data-src/cap-exams/r32_frequency_reconciliation_v1.json`, clave estable `(examId,number)`, página fuente y firma normalizada de **enunciado + cuatro opciones**.
- La columna ordinal `group` del selector R32 se utiliza solo para comparar cortes y **nunca como identificador persistente de variante**.

## Reconciliación permitida

| Concepto | Corte histórico | Generación C23 | Alcance |
|---|---:|---:|---|
| Apariciones | 128 | 128 | Sin altas ni bajas |
| Variantes exactas R32 | 92 | 92 | Sin variaciones |
| Filas con cambio exclusivamente ordinal | — | 32 | Solo `group` |
| Filas con cambio ordinal y frecuencia | — | 3 | Solo `group`, `frequency`, `examFrequency` |
| Enunciados, opciones, clave, respuestas y procedencia | — | — | **Cero cambios** |
| Decisiones editoriales aplicadas | 0 | 0 | `staged_not_applied` |

Los tres casos reales comparten enunciado y solución textual **FND.**, pero no el conjunto de distractores:

| Modelo | Pregunta, página | Frecuencia histórica → actual | Variantes exactas |
|---|---|---|---|
| 2024-04-06 Mercancías global | #24, p. 5 | 2 → 3 | 1 |
| 2025-07-26 Mercancías A | #20, p. 99 | 1 → 3 | 1 |
| 2025-07-26 Mercancías B | #23, p. 188 | 2 → 3 | 1 |

En total: **3 modelos, 2 fechas, 3 variantes exactas**. La frecuencia antigua 2/2/1 dependía de la asignación `matching[0]` a códigos diferentes del banco; C23 estabilizó esa asignación para la frecuencia, sin modificar las respuestas.

## Guardas de CI

`scripts/test_technical_review_r32.py` comprueba:

1. El checksum Git blob SHA del expediente histórico **byte a byte**, anclado a valor constante y al manifiesto versionado.
2. Que la selección actual conserve las 128 apariciones y 92 variantes y todos los campos de contenido, respuestas, páginas y temas.
3. Que **solo** las 35 apariciones listadas puedan diferir en `group`, `frequency` y `examFrequency`, con valores **antes y después exactos**. Cualquier nueva discrepancia bloquea CI.
4. Que 32 cambios sean exclusivamente ordinales y que los otros 3 sean exactamente el caso FND documentado; firma de variantes y solución FND comprobadas.
5. Que R27-R31, el total de 2.382 apariciones puntuables, las 1.336 preguntas puntuables distintas y las decisiones R32 pendientes permanezcan intactos. Los demás tests de scoring y Top 100 continúan en CI.
6. Que la validación sea de solo lectura para los datos de exámenes y únicamente exporte la copia informativa del expediente R32.

No se han vuelto a comprobar físicamente los PDF oficiales en R33; la evidencia se limita al expediente R32 congelado, las dos generaciones de GitHub Actions y los datos enlazados.

## Estado de la fase

El commit R33 contiene exclusivamente el manifiesto de excepciones, el validador más estricto y este documento. El PR #21 sigue DRAFT sin merge. La conclusión de ejecución debe documentarse con los IDs de GitHub Actions correspondientes, sin asumir PASS antes de confirmarlo.
