# R47 — Plan autorizado de respaldo lógico y ensayo de recuperación (19-11-2026)

**ESTADO: DISEÑO DOCUMENTADO, SIN EXPORTAR, SIN RESTAURAR, SIN DDL/DML REAL.**

## 0. Baseline
- Repositorio `sergioroqueh/cap-test`; rama `feat/cap-commercial`; PR #21 DRAFT; `main` intacta.
- Antes de R47, HEAD R46 `5fabeda9834215293dfd0194c91c4126a6794540`.
- `rutacap-dev` / `rhtbqetskghkarxhrgee`: PostgreSQL 17.12, organización RutaCAP plan **Free**. El plan Free no incluye copias automáticas diarias gestionadas como Pro/Team/Enterprise; no se ha verificado backup externo recuperable.
- CI del HEAD R46: workflow #44496724242 R38-R45 SUCCESS, jobs `auth-consent` y `r44-disposable-postgresql17` ambos SUCCESS; `Validate CAP Test` SUCCESS. Otros workflows podían continuar en curso en la primera consulta.
- R43 `docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql` sin aplicar; R45 postflight sin ejecutar.

## 1. Reglas de autorización
Este documento **NO autoriza** crear copias, recuperar datos, crear recursos, cambiar passwords, generar tokens, copiar Auth, instalar SQL ni contratar servicios. Para pasar de fase pedir autorización separada indicando destino privado y alcance. No ejecutar nada mientras se esté trabajando y no pedir PowerShell en el trabajo.
No publicar dumps, datos de Auth, connection strings, secretos, contraseñas, logs sensibles ni hashes de credenciales en GitHub, CI, conversaciones o carpetas sincronizadas sin cifrar.

## 2. Método de extracción propuesto (SOLO PLAN; no ejecutar)
Seguir la documentación oficial vigente, verificar versión instalada y ayuda de CLI antes de construir comandos concretos. Documentación:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

La guía oficial separa tres volcados con `supabase db dump` sobre una conexión privada: roles (`--role-only`), esquema y datos (`--data-only --use-copy`). El ejemplo oficial excluye `storage.buckets_vectors` y `storage.vector_indexes` del volcado de datos; contrastarlo con la versión CLI del momento.
**Nunca introducir la contraseña en argumentos visibles, historial de terminal, capturas, PR o variables persistentes.** Usar mecanismo de secret/cadena de conexión temporal aceptado por la CLI, sin imprimirlo. No resetear contraseña para ejecutar backup sin una autorización aparte.
Guardar `roles.sql`, `schema.sql`, `data.sql` en directorio local privado, restringido y cifrado, fuera de repositorio y CI. Registrar hashes SHA-256 de archivos únicamente en manifiesto privado (un hash NO prueba restaurabilidad).
Alcance: tablas comerciales `rc_*`, definiciones RLS, funciones, políticas, permisos y secuencias; verificar datos de `auth` y `storage` que realmente cubre el método y decidir explícitamente cualquier exclusión. Los **objetos binarios** de Storage API no están incluidos en un backup de base de datos: necesitarían inventario y exportación independiente si existen. Verificar configuraciones GoTrue/OAuth, secretos, integraciones, root encryption key/Vault, extensiones y migration history; nunca asumir que quedan cubiertas por el SQL. Revisar procedimientos de restauración de Auth con claves de cifrado: un clon manual puede requerir reconfiguración y las sesiones podrían no conservar validez.

## 3. Ensayo de recuperación (SOLO PLAN)
Requiere **segunda autorización** específica y destino controlado: PostgreSQL 17 local/contenedor desechable o proyecto Supabase de ensayo independiente si se necesitan servicios gestionados/Auth/Storage. Un PostgreSQL genérico puede validar SQL y políticas, pero **NO** demuestra recuperación integral de GoTrue/Auth ni del entorno Supabase.
Antes de restaurar: confirmar que el destino es desechable, aislado y vacío; nunca apuntar a `rutacap-dev` ni producción, ni confiar en nombres únicamente; verificar host/project-ref y solicitar aprobación si existe riesgo de coste.
Restauración únicamente en destino aislado, conforme a la guía oficial y con fallo estricto. Medir: errores, extensiones, roles, objetos, seis tablas RLS, doce políticas actuales, funciones, privilegios, conteos, fingerprints esperados y migration history; ensayo A/B Auth solo con permiso separado y cuentas de prueba. Comprobar objetos Storage si aplican. Registrar limitaciones explícitas (por ejemplo, integración OAuth y claves no restauradas). Cifrar o eliminar temporalmente datos de la prueba según una política autorizada.
**Criterio PASS**: exportación íntegra y protegida, recuperación repetible aislada, validación de integridad documentada, limitaciones aceptadas. **NO-GO** si hay falta de secretos/configuración necesaria, archivos incompletos, diferencias inesperadas, datos no cubiertos o pruebas sin autorización.

## 4. Secuencia de puertas
A. R47: documentación y CI, sin ejecución (hecha).
B. Autorización para exportación privada de SOLO LECTURA y ubicación cifrada; inspección de los resultados y comparación con preflight.
C. Autorización separada para restauración en destino independiente; verificación completa y registro sin secretos.
D. Posterior, nueva autorización **expresa y separada** para R43, previa reevaluación del preflight R45 y del HEAD. Nunca interpretar «Continuar» como autorización.

## 5. Riesgos y remediación ajena a R43
Los advisors detectaron `public.rls_auto_enable()` SECURITY DEFINER, ejecutable (según ACL) por `anon` y `authenticated`, y protección de contraseñas filtradas desactivada. Remediación por otro cambio autorizado. Ni la prueba de backup ni R43 solucionan automáticamente esos avisos.
La CI de R46 incluye una indicación externa Vercel SUCCESS en el status combinado. No se ha comprobado que corresponda a un despliegue nuevo: **no inferir ausencia de deploy solo a partir del workflow focalizado**. Mantener prohibido modificar Vercel.

## 6. Limitaciones
No hay todavía volcado, resultado de ensayo, prueba de copia segura, inventario completo de Storage ni verificación real del panel Database > Backups. No certificar recuperación hasta superar B y C.
