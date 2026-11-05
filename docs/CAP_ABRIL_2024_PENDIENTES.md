# CAP Test 2026 — Auditoría de Mercancías 06/04/2024

**Ronda 11 — 05/11/2026.** Fuente primaria: `Examenes TOTALES.pdf`, páginas 1–21 (paginación física PDF); transcripción `data-src/cap-exams/raw/2024-04-06-mercancias-global.json`.

## Integridad y resultado

- Examen completo: **100/100 preguntas principales**, numeradas 1–100 con **cuatro opciones A–D**.
- **Reservas 101–103 de la página 21 excluidas**, tanto del examen como del cálculo de frecuencia.
- **73/100** respuestas recuperadas por cotejo conservador con el banco original de **8.655 preguntas / 33 cuestionarios**, sin alterar dicho banco.
- **27/100** sin autocorrección, consultables pero no puntuables. No se han adjudicado letras por semejanza o conocimiento general.
- El documento `Plantilla Abril 2024.pdf` figura en el manifiesto de fuentes, pero **no hay clave digitalizada de este modelo** en `answer_keys_unverified.json`: ninguna respuesta se ha declarado validada por contraste con plantilla.
- Todas las preguntas conservan `transcriptionReview=true`, `reviewRequired=true` y `sourceMethod=LECTURA_VISUAL_PDF_PENDIENTE_REVISION`.

## Cola editorial de 27 preguntas sin respuesta recuperada

Los códigos y similitudes siguientes son **pistas automáticas, no soluciones validadas**. Se deben cotejar el PDF original y, si está disponible, la plantilla correcta del mismo modelo y convocatoria.

| Pregunta | Página PDF | Candidato del banco | Similitud | Nota editorial |
|---:|---:|---|---:|---|
| 2 | 1 | 448 | 0.927 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 4 | 1 | 1133 | 0.817 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 7 | 2 | 2443 | 0.945 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 8 | 2 | 2653 | 0.927 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 10 | 2 | 2809 | 0.664 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 14 | 3 | 5236 | 0.913 | CMR: comprobar alcance exacto y literalidad |
| 16 | 4 | 7222 | 0.989 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 18 | 4 | 7633 | 0.949 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 28 | 6 | 243 | 0.883 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 31 | 7 | 1372 | 0.965 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 35 | 7 | 2276 | 0.841 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 40 | 9 | 1008 | 0.828 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 44 | 9 | 3428 | 0.890 | Dos preguntas parecidas del banco (seguridad activa/pasiva): comprobar negaciones y alternativas |
| 51 | 11 | 4130 | 0.917 | Tiempo de espera en frontera: exige cotejo con reglamentación |
| 55 | 12 | 4624 | 0.880 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 63 | 13 | 535 | 0.919 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 66 | 14 | 5334 | 0.824 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 69 | 14 | 5747 | 0.917 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 71 | 15 | 4252 | 0.992 | Distancias de traslado a báscula: comprobar norma aplicable a fecha del examen |
| 75 | 16 | 6511 | 0.935 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 76 | 16 | 6551 | 0.987 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 82 | 17 | 6674 | 0.945 | Enunciado compartido por variantes: cotejar opciones y respuesta textual |
| 89 | 19 | 7919 | 0.934 | Cifra de cobertura del seguro: contraste documental y normativo |
| 90 | 19 | 5289 | 0.980 | Variación de redacción del reposacabezas, verificar original |
| 93 | 19 | 7955 | 0.814 | Riesgo de hielo: revisar foto original |
| 96 | 20 | 2005 | 0.945 | Revisar enunciado, cuatro opciones y plantilla antes de dar clave |
| 98 | 20 | 65352 | 0.945 | Alumbrado: comprobar exacta modalidad de la obligación |

## Reglas de aceptación

1. Comprobar visualmente cada transcripción frente a la página PDF original. No dar por validado el texto solamente por haber recuperado una respuesta del banco.
2. Si se obtiene la plantilla original del 06/04/2024, distinguir el apartado **Mercancías Global** de otros modelos y reservas. Cotejar letra y posición exactas.
3. Mantener las 27 sin puntuación hasta que exista evidencia suficiente. No promocionar `review_hints` a claves automáticamente.
4. Preservar 26 modelos × 100 preguntas, denominadores separados de Mercancías/Viajeros, banco 8.655/33 y el caso de conflicto febrero 2026 q61.
5. Comprobar CI y beta aislada antes de fusionar el PR #6; producción permanece en main.
