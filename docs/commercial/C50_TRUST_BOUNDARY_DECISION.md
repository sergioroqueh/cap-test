# C50 — Cierre prudente del modelo sintético y decisión de arquitectura

Fecha: 18/11/2026 · Rama: `feat/cap-commercial` · PR #21 DRAFT.

**No apto para producción. Sin Supabase real, migraciones, despliegue, pagos,
scoring, UI, ni cambios en `main`.**

## Decisión

No añadimos una cuarta base de datos ni otra simulación completa de autoridad.
C41–C49 ya habían validado aislamiento local, recuperación, idempotencia,
rotaciones y el fallo crítico del rollback conjunto de las 3 SQLite.

C50 limita la auditoría a **una referencia independiente del backup de las
tres SQLite**: archivo de observación sintético en un directorio del cliente,
con raíz pública P-256 fijada fuera del recibo, prueba firmada, secuencia,
época, generación, huella de estado y raíz C47. Cada evidencia se añade al
histórico con encadenamiento SHA-256; lecturas y escrituras cooperativas usan
un fichero lock creado con `wx`. Se fuerza `fsync` del archivo de prueba.

Esto es persistencia de fichero, no un log WORM auténtico, hardware seguro,
separación de usuario/sistema ni durabilidad certificada frente a corte de luz.
La recuperación de un lock huérfano queda bloqueada hasta intervención
explícita; no hay autoreparación silenciosa.

## Resultado buscado y límite

1. Si vuelven atrás las tres SQLite C47/C49 pero el observador C50 **sigue
   intacto**, rechaza las atestaciones antiguas firmadas por debajo de la
   máxima secuencia/generación vista.
2. El observador rechaza una huella distinta en la misma secuencia, una
   cadena de rotación inválida, una raíz diferente y corrupción/truncamiento.
3. Un reintento idéntico de la misma atestación no aumenta el historial.
4. **No protege frente a compromiso de clave privada activa.** Quien posea
   esa clave puede firmar pruebas futuras plausibles.
5. **No protege frente a rollback del propio observador.** Si el atacante
   restaura las tres SQLite Y este archivo, la antigüedad puede pasar
   desapercibida sin referencia exterior inmutable.
6. No aporta atomicidad entre confirmaciones C47, C49 y observación C50.
   Puede haber una brecha de disponibilidad, de confirmación o de respuesta;
   no reconciliar automáticamente.

## Próxima etapa: no abrir C51 como otra ronda sintética automática

Priorizar trabajo de producto y contractual antes de sumar más tests:

- Elegir arquitectura real de identidad, API de autorización, dispositivo,
  estado monotónico, control de acceso, recuperación administrativa, firmas
  y custodia de claves. Decidir qué parte se alojaría en Supabase y qué parte,
  si alguna, requeriría un servicio de autoridad.
- Diseñar la política de respaldo verificable fuera de banda: quién administra
  la raíz, qué acción es irreversible y qué sucede con una pérdida de estado.
  Documentar explícitamente que no se promete resistencia a compromiso total.
- Corregir la avería editorial del workflow general R32 en una ronda
  separada, sin modificar scoring ni preguntas, cuando se autorice su alcance.
- Al planificar el uso real de **Vercel**, validar allí builds, rutas SPA/PWA,
  caché offline, servicio de autenticación y errores de red. Vite puede
  desplegarse en Vercel, sin migración obligatoria a Next.js.
- Solo entonces ejecutar pruebas reales de servicio: revocación entre
  dispositivos y sesiones, renovaciones, interrupciones, restauración,
  claves de test custodiadas y tráfico controlado. No crear credenciales
  ni autorizar operaciones de producción desde esta ronda.

La CI C50 comprueba solamente casos sintéticos enfocados, sin repetir
todas las baterías C41–C49. Las regresiones completas están documentadas
en C49 y se volverán a ejecutar cuando existan cambios que las afecten.

## Archivos

- `scripts/c50_independent_anchor.mjs`
- `scripts/test_independent_anchor_c50.mjs`
- `.github/workflows/c50-pinned-anchor.yml`
- `docs/commercial/C50_TRUST_BOUNDARY_DECISION.md`

La verificación definitiva debe enlazar a una CI de GitHub Actions
completada sobre exactamente el HEAD informado. No confundir este informe
con habilitación comercial de producción.
