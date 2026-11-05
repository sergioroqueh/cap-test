# CAP Test — R16 (05/11/2026): plantilla febrero de 2026 verificada visualmente

## Fuente recibida
- Archivo original subido por el usuario: `Respuestas(1).zip`.
- PDF incluido: `Plantilla Febrero 2026.pdf`; SHA-256 `df29f426fc22c50502b8afcc448a374b78a079a89b5bf1fbc2818f25c55f6d87`.
- Página 1, encabezado visible «MERCANCÍAS GLOBAL / PLANTILLA DEL EXAMEN DE FEBRERO DE 2026».
- Lectura manual de la imagen de la página: cinco columnas para preguntas 1–20, 21–40, 41–60, 61–80 y 81–100. Coincide con las 100 letras previamente extraídas.

## Resultado
- 100/100 letras de plantilla leídas; la plantilla original se considera verificada como documento.
- **99 preguntas puntuables** en este examen y **una bloqueada**.
- 86 concordancias con el banco general; otras 13 preguntas, antes sin respuesta, adquieren una clave directamente comprobada.
- Pregunta 61: la plantilla marca **A** («Sí, siempre»), mientras el banco y la interpretación normativa registrada sugieren **C** («Sí, en caso de que posea una»). Es una discrepancia real con la hoja original, no un error de extracción: **se conserva sin calificación** hasta revisar enunciado y fuente.
- El archivo `data-src/cap-exams/answer_keys_visually_verified.json` mantiene PDF SHA-256, clave visual y registro de conflicto. Se retiró la antigua clave provisional de `answer_keys_unverified.json`.
- En el banco total: 2.600 apariciones, 2.039 puntuables, **561 pendientes**; de ellas **381** corresponden a modelos con plantilla identificada y **180** a los cuatro modelos aplazados. Los datos originales de 8.655 preguntas no se modifican.
- No se mezclan modelos, preguntas de reserva ni ampliaciones. El PR sigue en borrador.

## Próximo paso
Continuar revisión visual de las plantillas originales restantes dentro del ZIP; para julio 2023 A no imponer desplazamientos de preguntas a partir de la letra 44 sin validar también la numeración del examen. Se mantiene el conflicto documentado.
