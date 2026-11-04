# CAP Test — importación auditada de exámenes (04/11/2026)

## Estado: PR de trabajo, sin aprobar para producción

Se conserva el banco original: **8.655 preguntas / 33 cuestionarios**, el login y
el progreso existente. No modifica ni sobrescribe los TXT de origen.

### Documentos recibidos
- Exámenes TOTALES.pdf: 499 páginas.
- 25 exámenes principales de Mercancías (19 con texto procesable, seis escaneados).
- Un examen principal de **Viajeros/autobús**, de 06/04/2024, en las páginas 28–50:
  pendiente de transcripción. No se mezcla con Mercancías.
- Ampliaciones de 06/04/2024 (Mercancías 22–27 y Viajeros 51–56):
  registradas pero **excluidas del recuento de frecuencias** por repetir preguntas.
- Respuestas.zip: 22 plantillas. Se transcribieron 16 series de 100 letras como
  **fuente no validada**, en \`answer_keys_unverified.json\`.
- Faltan plantillas originales de 21/05/2022, 02/12/2023 y modelo B de 26/07/2025.

### Flujo de compilación
\`scripts/build_data.py\` crea el banco original con su control de 8.655/33.
Después \`scripts/build_exam_data.py\`:
1. Lee el catálogo por fecha, modalidad y modelo.
2. Conserva páginas de origen en \`data-src/cap-exams/raw/\`.
3. Extrae 100 preguntas principales (excluye reservas 101–103).
4. Compara el **enunciado y las cuatro opciones** con el banco original.
5. Si las cuatro opciones coinciden aunque el orden sea distinto, traslada la
   respuesta correcta por **texto de opción**, nunca copiando la letra a ciegas.
6. Contrasta la letra de plantilla si existe; nunca resuelve contradicciones
   mediante una suposición.
7. Publica el catálogo, frecuencias e historial de fuentes en \`public/data/exams/\`.

### Estados de respuesta
- \`coincidencia_automatica\`: banco y plantilla están de acuerdo. Aun así, cotejo automático.
- \`respuesta_banco_pendiente_revision\`: solo banco original, revisión editorial pendiente.
- \`solo_plantilla_pendiente_cotejo\`: letra de plantilla pero sin comparación suficiente;
  **no entra a test autocorregido**.
- \`conflicto_plantilla_banco\` / \`conflicto_banco\`: bloqueado para corrección.
- \`sin_respuesta_verificada\`: bloqueado hasta completar cotejo.

Tres etiquetas de opción reconstruidas en febrero 2025 y junio 2023 constan
expresamente en \`override_transcriptions_review.json\`. Requieren revisión visual.

### Frecuencia e interpretación
El contador indica número de **modelos de examen transcritos** distintos en que
se observó la misma pregunta (por coincidencia exacta; variantes aún no fusionadas).
Denominador inicial: 19 modelos de Mercancías con 100 preguntas transcritas.
No expresa probabilidad oficial de la próxima prueba.
No incluye ampliaciones, reservas ni escaneados incompletos.


### Ronda 2 — cotejo ampliado (04/11/2026)
Tras cruzar de nuevo las 1.900 preguntas con el banco original:

| Estado | Preguntas |
| --- | ---: |
| Coincidencia exacta banco + plantilla | 1.044 |
| Coincidencia por enunciado y texto correcto, también confirmada por plantilla | 138 |
| Respuesta solo del banco (coincidencia exacta) | 165 |
| Respuesta solo del banco (mismo enunciado y texto correcto) | 29 |
| Solo plantilla, todavía sin cotejo suficiente | 385 |
| Conflicto banco / plantilla bloqueado | 33 |
| Sin respuesta suficientemente sustentada | 106 |

**Total con respuesta recuperada del banco: 1.376/1.900.**
Son cotejos automáticos, no una revisión humana de las 1.376 soluciones.
La segunda pasada encuentra 170 candidatos con el mismo enunciado y el texto
de la respuesta, de los que 167 se recuperan y tres quedan bloqueados por
contradicción. El método exige que todos los candidatos del banco con ese
enunciado conduzcan al mismo texto de respuesta disponible en el examen.
Todas las coincidencias de segundo nivel se marcan como **pendientes de revisión**.

La interfaz indica "práctica parcial (X/100)" cuando todavía no existen 100
respuestas cotejables. Las preguntas sin respuesta fiable permanecen registradas
en los datos de origen y en la cola de revisión, pero no se autocorrigen.
El examen de Viajeros no se fusiona ni se sortea entre los de Mercancías.

**No fusionar el PR por el mero hecho de que la CI sea verde.** Quedan 33
contradicciones y seis exámenes de Mercancías más el de Viajeros con páginas
escaneadas, además de revisión manual de fuentes.

### Criterio de publicación
**No fusionar** este PR hasta:
- CI verde, generación exacta de 26 entradas y 1.900 preguntas procesadas.
- Verificación visual de incidencias y respuestas contradictorias (especialmente
  julio 2023 A/B).
- Confirmar que las preguntas pendientes no muestran soluciones inventadas.
- Probar login, navegación, repaso, sincronización y PWA en un móvil.
- Completar posteriormente las seis pruebas escaneadas y el examen de Viajeros.

La rama permite avanzar sin interrumpir producción. No publicar un examen
como «100 preguntas corregidas» si parte de sus soluciones siguen pendientes.
