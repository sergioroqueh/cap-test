# CAP — Septiembre 2026 Mercancías A: revisión de 10 preguntas sin clave

Fecha: 04/11/2026. Fuente: `Examenes TOTALES.pdf`, páginas **128–144** (1-based),
`2026-09-26-mercancias-a.json`; **100/100** preguntas visuales disponibles,
**90** con cotejo del banco maestro, **10** pendientes.

## Reglas de seguridad de respuestas

Este informe recoge **candidatos orientativos**, generados por similitud con
el banco maestro original. **No son claves correctas aprobadas**. Ninguna
sugerencia se debe publicar como `correctAnswer` ni usar para puntuar hasta
comparar visualmente los enunciados/opciones originales o contrastar una
plantilla original de respuestas. El manifiesto identifica
`Plantilla A Septiembre 2026.pdf` pero no existe su clave en
`answer_keys_unverified.json`.

| Pregunta | Pág. PDF | Código maestro candidato | Puntuación similitud | Motivo principal de revisión |
|---:|---:|---|---:|---|
| 2 | 128 | 2460 | 0,890 | Texto de respuesta del banco tiene «un frenada» y el examen «una frenada». No forzar corrección del original |
| 6 | 128 | 2793 | 0,945 | Diferencia de singular/plural «mercancía» / «mercancías»; revisar literalidad |
| 8 | 129 | 153 | 0,977 | Enunciado del maestro añade «también»; no asignar por semejanza |
| 22 | 131 | 65579 / 65578 | 0,722 / 0,612 | Dos entradas distintas del banco proponen textos de respuesta diferentes para peajes; **prioridad editorial alta** |
| 27 | 132 | 195 | 0,890 | Pregunta genérica y varias entradas con ese mismo enunciado; variantes sobre accidente *in itinere* |
| 29 | 132 | 400 | 0,890 | Banco dice «coche» y el examen «vehículo» en la respuesta candidata |
| 40 | 134 | 1669 | 0,869 | Enunciado de lectura visual requiere revisar literalmente «piel y ojos» y el tipo de lesión |
| 45 | 135 | 2108 | 0,851 | Enunciado diferente aunque opciones aparentemente coincidentes |
| 82 | 141 | 7968 | 0,988 | Ligera diferencia en enunciado; revisar pausas y orden de los dos intervalos |
| 93 | 143 | 65836 | 0,973 | «aire espirado/expirado»; por tratarse de una cifra legal exige verificación original y normativa vigente a fecha del examen |

**Estado actual:** los diez casos siguen
`answerStatus=sin_respuesta_verificada` y `correctAnswer=null` en el
artefacto generado. Consultables pero sin puntuación. Las 90 restantes
son respuestas **recuperadas del banco** y continúan sujetas a revisión
editorial de la transcripción visual.

## Orden de comprobación recomendado

1. Verificar la plantilla original «Plantilla A Septiembre 2026.pdf» contra
   la numeración 1–100 y las opciones A–D de las páginas 128–144.
2. Priorizar la pregunta 22 y cualquier discrepancia entre plantilla y banco.
3. Comprobar literalmente las 10 preguntas anteriores en la imagen original.
4. Añadir eventuales ajustes de transcripción o claves solo con procedencia
   registrada; mantener sin editar la fuente original y sin forzar concordancias.
5. Ejecutar `npm run build` y `python3 scripts/test_exam_data.py`, auditar
   la cola `review_queue.csv`, y confirmar beta *preview* antes de integrar.
