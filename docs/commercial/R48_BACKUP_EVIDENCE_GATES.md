# R48 — Comprobadores de evidencia de recuperación (19-11-2026)

**ESTADO: TESTS SINTÉTICOS SOLAMENTE. NO HAY RESPALDO REAL NI RESTAURACIÓN REAL VERIFICADOS.**

## Entregables
- `scripts/test_r48_backup_evidence.mjs`: diez pruebas `node:test` completamente en memoria. No consulta bases, red, secretos, entornos ni ficheros de respaldo.
- `.github/workflows/r48-backup-evidence.yml`: CI focalizada sólo cuando cambian los comprobadores, este documento o su workflow; no expone variables de Supabase ni requiere servicio PostgreSQL.
- Proyecto real `rutacap-dev` **no se consulta ni modifica**. No se modifica Vercel, `main`, scoring, preguntas ni interfaz.

## Puertas comprobadas
1. El manifiesto sólo acepta `environment: synthetic` y `projectRef: fixture.invalid`, nunca la referencia real.
2. Se exige exactamente un trío de metadatos ficticios: `roles.sql`, `schema.sql`, `data.sql`; tamaño entero positivo y SHA-256 hexadecimal de 64 caracteres. Esto **no** verifica el hash contra archivos reales.
3. Se declaran protección cifrada y almacenamiento privado fuera de GitHub (en fixtures, no observación real).
4. Se categorizan cobertura de database, Auth, objetos Storage, configuración/secretos; una etiqueta `unverified` es admisible para inventariar lagunas, **no** se interpreta como restaurabilidad.
5. Se exige restauración de fixture aislada, aprobada, ejecutada y con integridad declarada; se rechazan destinos reales.
6. Se rechazan campos ajenos al contrato para reducir riesgo de incluir datos sensibles. No es un escáner general de secretos.
7. Ante cualquier error, `NO_GO`; ante fixture estructuralmente válido, **únicamente** `FIXTURE_PASS_ONLY`. En toda circunstancia `liveRecoveryVerified=false` y `r43Authorized=false`.

## Límites críticos
- El validador sólo inspecciona declaraciones sintéticas en memoria; no inspecciona volcados, hashes reales ni restauraciones de PostgreSQL/GoTrue.
- Cualquier prueba futura sobre un respaldo auténtico requiere herramienta aislada separada, evaluación de exposición de datos, autorización para exportar, y una segunda autorización para restaurar.
- Nunca transportar dumps, tokens, claves ni datos de Auth al repositorio, CI o al chat.
- Un PASS de GitHub **no levanta el bloqueo R43**.

## Secuencia futura sin autorización implícita
A. CI R48 PASS sólo para fixtures.
B. Permiso explícito de exportación privada, cifrada, y verificación de alcance Auth/Storage.
C. Permiso explícito de restauración aislada en destino autorizado.
D. Comprobación real de estructura, conteos, RLS, privilegios, migraciones e integridad y documentación privada.
E. Sólo después nueva autorización expresa para paquete R43 y postflight de R45.

Base: `docs/commercial/R47_RECOVERABLE_BACKUP_PLAN.md`. Seguridad: avisos `rls_auto_enable()` y protección de contraseñas filtradas siguen pendientes y fuera de alcance.
