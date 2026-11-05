# CAP Test 2026 — R25-3: cierre editorial de las tres contradicciones de Mercancías

**Fecha:** 05/11/2026. **Rama:** `feat/examenes-cap-auditoria-2026-11`. **PR:** #6, borrador; `main` no modificado.

## Decisión global

**Tres de tres casos cerrados en el plano técnico/editorial.** Ninguno implica una fe de erratas publicada por el tribunal. Las 100 preguntas de cada convocatoria se mantienen visibles, las letras originales se conservan y estas tres **no puntúan ni registran aciertos/fallos**.

Se distinguen tres conceptos que nunca deben mezclarse: (1) **letra literal** en plantilla oficial; (2) **respuesta técnica razonada** a la luz de un reglamento o documentación del motor; (3) **regla de puntuación de la PWA**. Las decisiones de este informe resuelven la incertidumbre del equipo editorial, NO sustituyen el acto administrativo del tribunal.

| Convocatoria | Pregunta | Plantilla literal | Banco | Orientación final | Decisión para CAP Test |
|---|---:|:---:|:---:|:---:|---|
| Mercancías A, 26/07/2025 | 43 | A | B | **B** | Discordancia fuente-técnica cerrada; no puntúa |
| Mercancías Global, 07/02/2026 | 61 | A | C | **C** | Discordancia normativa cerrada; no puntúa |
| Mercancías Global, 28/03/2026 | 43 | C | B | **Ninguna** | Pregunta anulada **editorialmente**; no puntúa |

## Caso 1: julio 2025 A, pregunta 43

El PDF público de la Junta de Comunidades de Castilla-La Mancha muestra el enunciado **«Ordene los motores de mayor a menor consumo específico»**, con estas alternativas:

- A: diésel directa → diésel indirecta → gasolina directa → gasolina indirecta.
- B: gasolina indirecta → gasolina directa → diésel indirecta → diésel directa.
- C y D: otras mezclas de ambos ciclos.

**La correcta en sentido técnico general es B**. El orden de A sería el inverso (menor a mayor), ya que las eficiencias típicas van de gasolina indirecta hacia diésel directa. La plantilla original que aportó el usuario marca **A** y queda conservada tal como fue leída y verificada.

Fuentes: [cuestionario oficial CLM](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250728/2025_cap_4a_prueba_cuestionarios.pdf#page=7); [plantilla correctora original CLM](https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250728/2025_4a_prueba_cap_-_plantillas_correctoras.pdf); [IDAE, eficiencia de diésel y sistemas de inyección](https://www.idae.es/sites/default/files/documentos/publicaciones_idae/documentos_10297_treatise_combustiblesvehiculosalternativos_a2005_d9d8d6b3.pdf); [Test CAP, clasificación de mayor a menor](https://testcap.es/test-cap-mercancias/tema/comunes-objetivo-1-1-6/). La interpretación técnica no prueba una rectificación oficial de 2025; la imagen del corrector externo no se pudo recuperar nuevamente en esta sesión, por lo que se respeta la lectura original previamente preservada.

**Resultado:** `CERRADA_CLAVE_ORIGINAL_DISCREPA_NO_PUNTUABLE`, recomendación de estudio B, solución puntuada `null`, letra original A.

## Caso 2: febrero 2026 Global, pregunta 61

Enunciado: **¿Está obligado un conductor a presentar la tarjeta de conductor a los agentes aunque utilice tacógrafo analógico?**

- A de la plantilla: «Sí, siempre».
- C del banco: «Sí, en caso de que posea una».

**El Reglamento (UE) 165/2014, art. 36.1.ii, es expreso: presentar tarjeta de conductor si la posee.** Por tanto, **C** es la orientación técnica/normativa correcta. La plantilla mantiene A, sin que hayamos acreditado rectificación del tribunal.

Fuentes: [texto consolidado EUR-Lex Reglamento 165/2014](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A02014R0165-20241231), art. 36; [BOE/DOUE publicación original](https://www.boe.es/doue/2014/060/L00001-00033.pdf).

**Resultado:** `CERRADA_NORMA_UE_DISCREPA_NO_PUNTUABLE`, orientación de estudio C, solución puntuada `null`, letra original A.

## Caso 3: marzo 2026 Global, pregunta 43

El PDF compuesto `Examenes TOTALES.pdf`, **página 355**, revisado visualmente en R20, muestra una pregunta relativa a **problemas de circulación sanguínea** junto a cuatro alternativas: **placas de hielo en cámaras frigoríficas; levantamiento de pesos; invasión de zonas restringidas; manejo imprudente de maquinaria**.

Las cuatro opciones son de riesgos diferentes y no permiten contestar de forma inequívoca a la circulación sanguínea. Que el banco sugiera B y la plantilla señale C no resuelve ese defecto de origen, que no puede atribuirse meramente a una letra mal transcrita.

**Resultado:** `CERRADA_ANULADA_EDITORIALMENTE_ENUNCIADO_INCOHERENTE`, sin orientación A–D, solución `null`, letra de hoja C preservada. **No se afirma que el tribunal la haya anulado oficialmente.**

## Tratamiento de puntuación y UX

Los tres casos permanecen completos en exámenes de 100 preguntas, en estudio y modo examen. Ahora incorporan `editorialDecision` (estado, orientación, motivo, referencias y confirmación expresa de que no hay fe de erratas oficial) en los datos derivados de la pregunta. La interfaz:

- muestra «decisión editorial cerrada» y la orientación B o C, o «pregunta inválida»;
- muestra por separado plantilla y banco;
- no registra un acierto ni un error en cualquiera de las tres;
- excluye las tres del denominador de la nota, del historial de fallos y de los simulacros mezclados;
- en preguntas sin puntuación no pinta la letra oficial como si fuera una respuesta correcta;
- preserva las marcas de auditoría R21, cuyo P0 documenta el **conflicto histórico** aunque su decisión editorial ya esté cerrada.

## La cuarta duda NO pertenece a estos tres conflictos

La pregunta **6 de Mercancías 26/11/2022** (caja de cambios frente a función del embrague) fue marcada como **dudosa técnicamente** en R22, pero **no era una de las tres contradicciones de plantilla y banco que estaban excluidas de puntuación**. Permanece separada y con letra A puntuable provisionalmente. No ocultar su existencia ni afirmar que toda pregunta de Mercancías ya está certificada visualmente.

## Integridad

- Banco general: 8.655 preguntas / 33 cuestionarios, sin modificar.
- Exámenes: 26 modelos / 2.600 preguntas.
- Hojas originales: 22 plantillas / 2.200 letras impresas, conservadas sin alteración.
- Puntuación: 2.417 puntuables; 183 sin puntuación (**180 sin clave de plantilla y tres cierres editoriales**).
- Tres orientaciones: B, C, ninguna. **0 cambios de claves históricas** y **0 cambios de puntuación**.
- La decisión no modifica el programa de reservas/ampliaciones, frecuencia, IDs canónicos, páginas ni cuestionarios.
- `main` no se fusiona; PR #6 se mantiene como borrador.

## Archivos

- `data-src/cap-exams/final_three_conflicts_decisions_2026_11_05.json`: 3 decisiones versionadas y cuarta duda fuera del alcance.
- `scripts/build_three_conflicts_decisions_r25.py`: verifica texto, fuente, respuesta original y estado y añade la decisión editorial al JSON derivado.
- `public/data/exams/editorial_decisions_r25_three.json` y `.csv`: informe generado reproducible.
- `src/capExams.ts` y `src/App.tsx`: entrega en visor, estudio, preguntas sin puntuación y resultados.
- `scripts/test_exam_data.py`: prueba de 3 cierres, dos recomendaciones y una invalidación sin puntuación.

Las pruebas CI y el despliegue de preview deben inspeccionarse **en el HEAD final**. Como Vercel alcanzó el límite `api-deployments-free-per-day` en R23, el build aislado de GitHub Actions queda como alternativa verificable si la preview del último SHA no está disponible.
