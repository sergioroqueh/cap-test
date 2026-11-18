# C52 — Mantenimiento reproducible y diagnóstico editorial R32 (18/11/2026)

**Ámbito:** rama `feat/cap-commercial`, PR #21 DRAFT. Sin merge, deploy,
Supabase real, activación cloud, migraciones, pagos, UI, scoring ni edición
de preguntas/exámenes. No se solicitaron comandos locales al usuario.

## Cambios de mantenimiento aplicados

### Dependencias y build reproducible

La rama carecía de `package-lock.json`, once dependencias directas tenían rangos
`latest` o `^` y `.github/workflows/ci.yml` ejecutaba `npm install`.
En esas condiciones una nueva ejecución puede resolver versiones diferentes.

Se ha utilizado **un runner GitHub Actions desechable** para obtener versiones
directas concretas y generar un lockfile npm v3, luego probar una instalación
limpia con `npm ci` y un `npm run build:preview` sin despliegue.
**Preflight generador #44336943460: SUCCESS.** Se incorporó al repositorio:

- `package.json` con 11 dependencias directas fijadas exactamente (7
  dependencies + 4 devDependencies);
- `package-lock.json` con 111 entradas resueltas;
- `.github/workflows/ci.yml` cambiado a `npm ci --no-audit --no-fund`;
- `.github/workflows/c52-dependency-lock.yml` como gate acotado de versiones
  exactas, lock consistente, `npm ci`, build preview y consulta de avisos
  `npm audit` **solo informativa, sin fix automático**.

Versiones congeladas en esta ronda (provenientes del runner, no de suposiciones):

| Paquete | Versión |
|---|---|
| Vite | 8.3.8 |
| plugin React de Vite | 6.3.0 |
| TypeScript | 7.0.2 |
| React / React DOM | 19.3.1 / 19.3.1 |
| Supabase JS | 2.119.1 |
| jsPDF | 3.0.4 |
| Playwright | 1.65.1 |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 |
| @types/node | 22.15.30 |

La instalación exacta reduce variabilidad futura; **no es certificación de
seguridad**. No se ha ejecutado `npm audit fix --force`, ni desbloqueado
dependencias automáticamente. Revisar avisos por impacto y exploitabilidad,
no actualizar de forma ciega.

### Error editorial R32: se distinguieron DOS fallos sucesivos

**Primer fallo (reproducido):** el selector
`scripts/select_technical_review_r32.py` genera correctamente la cola
`technical_review_r32_candidates.json` (92 grupos, 128 apariciones).
Más adelante `npm run build:preview` vuelve a ejecutar el paso de preparación;
`scripts/build_data.py` elimina `public/data` con `shutil.rmtree`, por
lo que el archivo efímero desaparecía antes de
`scripts/test_technical_review_r32.py`. El comprobador fallaba con
`FileNotFoundError`, ocultando las demás diferencias.

**Corrección acotada:** mover el selector R32 **después de la última
compilación** y antes de empaquetar/verificar pruebas. No alterar código de
generación de preguntas, datos fuente, selección, respuestas ni scoring.
La corrección elimina la dependencia temporal del pipeline y conserva el
artefacto de candidatos para el empaquetado.

**Segundo fallo, visible después de corregir el orden:**
`Validate CAP Test` #44336648433 llegó al assert
`c['group']==g['group'] and c['frequency']==g['frequency']`.
Comparación de la cola generada en el log de CI con
`data-src/cap-exams/technical_review_r32.json` congelado:

- Siguen presentes **128/128 apariciones** y los **92 grupos**.
- **35 apariciones** no coinciden exactamente con los metadatos congelados.
- **32** tienen diferencias únicamente en el ordinal de grupo causadas
  por el reordenamiento.
- **3** presentan una diferencia real en `examFrequency`, que provoca a
  su vez el reordenamiento:
  - `2024-04-06-mercancias-global`, pregunta 24: **2 → 3**.
  - `2025-07-26-mercancias-b`, pregunta 23: **2 → 3**.
  - `2025-07-26-mercancias-a`, pregunta 20: **1 → 3**.

**Decisión de seguridad editorial:** no cambiar esos valores, no modificar
el expediente R32 congelado, no alterar claves de respuesta y no hacer
pasar la CI mediante exclusión de la prueba. El conflicto de frecuencias
R32 debe resolverse en una revisión editorial **separada y autorizada**,
comparando el criterio de frecuencia de los exámenes y el corte de la
selección original. Hasta entonces, la CI general tiene motivo válido para
seguir roja; la puerta de publicación no está abierta.

## Gates del piloto (sin ejecutar servicios)

1. **Repositorios:** rama comercial, `npm ci`, lockfile y build reproducible,
   sin material editorial privado dentro del bundle.
2. **Calidad de contenido:** R32 resuelto con evidencia del criterio y
   retest editorial íntegro; origen y derechos de reutilización territorial
   comprobados antes de ofrecer cobertura de comunidades autónomas.
3. **Identidad:** aprobar entorno Supabase RutaCAP separado, roles y RLS,
   verificar A/B/guest y credenciales de cliente correctas, sin secretos.
4. **Progreso:** conectar sincronización offline-first con permiso del usuario,
   dos cuentas, recuperación, idempotencia y fallos de red.
5. **Permisos y servicio:** operaciones privilegiadas transaccionales en
   servidor, revocaciones y logs; no afirmar revocación instantánea offline.
6. **Despliegue:** solo con autorización, Vercel preview aislado, PWA, URLs,
   cachés, móviles reales y supervisión de errores.

No se deben conectar Vercel/Supabase reales ni cambiar `cloudConfigured=false`
en C52. No se ha implementado una nueva ronda de testigos sintéticos.

## Evidencia y límites

- Build congelado inicial sin servicios: [CI C52 generadora #44336943460](https://github.com/sergioroqueh/cap-test/actions/runs/44336943460) SUCCESS.
- Fallo R32 tras arreglar el orden: [Validate CAP Test #44336648433](https://github.com/sergioroqueh/cap-test/actions/runs/44336648433) FAILURE en comparación del expediente congelado, **no** por archivo ausente.
- La CI definitiva sobre el HEAD que incluya este informe debe comprobarse
  antes de dar por cerrado el mantenimiento y publicar su conclusión.
- No se ha probado aún sincronización cloud, backend de pago ni producción.
