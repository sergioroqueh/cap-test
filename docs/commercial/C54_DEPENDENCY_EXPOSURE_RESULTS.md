# C54 — Cinco alertas altas, un único origen y exposición real (18/11/2026)

**Rama:** `feat/cap-commercial` · PR #21 DRAFT · sin merge. No Supabase
real, migraciones, cloud, Vercel/despliegue, pagos, scoring, banco de
preguntas ni modificaciones de interfaz. No se iniciaron servicios externos.

## Diagnóstico respaldado por npm audit

El preflight reproducible [GitHub Actions C54 #44343895576](https://github.com/sergioroqueh/cap-test/actions/runs/44343895576)
ha terminado **SUCCESS**. Extrajo los campos `via`, `effects`,
`range` e `isDirect` del **JSON real** de `npm audit`.

Los **cinco** hallazgos HIGH representan **una sola vulnerabilidad directa**:

- **GHSA-fc5q-39xc-vjpf / CVE-2026-112366**: riesgo de **ReDoS** al
  procesar patrones *extglob* especialmente construidos mediante
  `picomatch`. `npm audit` marca la versión `picomatch@4.0.7`
  (rango afectado `<=4.0.7`), referencia
  https://github.com/advisories/GHSA-fc5q-39xc-vjpf .
- `vite@8.3.8` depende de `picomatch` y `tinyglobby`;
  `tinyglobby@0.2.17` depende de `picomatch` y `fdir@6.5.0`.
  `fdir` consume `picomatch`.
- `@vitejs/plugin-react@6.3.0` aparece por depender del ecosistema Vite,
  **no porque el informe encuentre una quinta vulnerabilidad autónoma**.
- `typescript@7.0.2` no aparece en ese advisory: se reclasifica por
  responsabilidad técnica (compilación), no por una alerta de seguridad propia.

**Nota de procedencia:** la ficha GHSA se publicó como aviso sin revisar;
otras bases podrían discutir su validez. No darlo por falso positivo por
conveniencia ni afirmar que existe un parche publicado si la consulta
de npm no lo ofrece. `npm audit` propone downgrades con cambios mayores
de Vite y plugin React, no una corrección directa compatible de picomatch.
No se aplicaron esos downgrades ni `npm audit fix --force`.

## Corrección de clasificación y verificación

`vite`, `@vitejs/plugin-react` y `typescript` estaban en
`dependencies`, aunque únicamente construyen la aplicación. Se trasladaron
a `devDependencies` con **las mismas versiones exactas**. npm regeneró
`package-lock.json` v3: **111 entradas idénticas por nombre, versión,
URL e integridad**; solo cambian los metadatos de `dev` y los campos
de dependencias directas correspondientes.

Resultados en el runner GitHub de C54:

| Comprobación | Antes | Después |
|---|---:|---:|
| `npm audit` completo | 5 HIGH, 0 CRITICAL | 5 HIGH, 0 CRITICAL |
| `npm audit --omit=dev` | No aplicable como prueba limpia mientras el toolchain figuraba como runtime | **0 avisos** |
| Build `npm run build:preview` | Dependencias disponibles | **PASS** |
| `cloudConfigured=false` | Desactivado | **PASS** |

El workflow final C54 verifica `npm ci` inmutable, clasificaciones
de dependencias, `npm audit` completo, `npm audit --omit=dev` sin avisos
y compilación preview aislada. **El resultado final debe confirmarse
sobre el HEAD definitivo**, no solo sobre el preflight.

## Superficies de explotación y medidas transitorias

- **PWA publicada:** el navegador recibe activos estáticos; no ejecuta
  el servidor Node de Vite ni procesa globs de build. El hallazgo
  detectado no implica que exista esa ruta explotable en el bundle
  distribuido. Auditar también el runtime y la API real cuando existan.
- **Desarrollo/preview Node:** Vite, su resolver y el sistema de globs
  siguen instalados en tareas de desarrollo. Un patrón
  particularmente construido podría afectar un proceso si alguna vía
  permite aportar ese patrón desde entrada no fiable. No exponer
  `vite dev` o `vite preview` a Internet; mantener binding a
  `127.0.0.1`, especialmente en pruebas locales de catálogo; no
  introducir globs controlados por usuarios.
- **CI y publicación:** usar lockfile exacto y `npm ci`, sin scripts
  de terceros ni PRs no confiables con credenciales privilegiadas.
  Compilar estáticamente y distribuir `dist`; no ejecutar un servidor
  Vite de desarrollo como aplicación comercial. Mantener auditoría
  completa, no solo `--omit=dev`.
- **Actualización:** revisar upstream y el advisory periódicamente;
  cuando exista parche inequívoco, probarlo en runner con build/PDF.
  No instalar paquetes antiguos vulnerables para conseguir un
  `npm audit` verde artificial.

## Estado de publicación

**C54 reduce el alcance del riesgo instalado en el producto, pero no elimina
los cinco avisos del entorno de desarrollo.** La decisión de aceptarlos
temporalmente requiere validación de uso y controles de CI. No declarar
seguridad completa por un resultado de auditoría de runtime igual a cero.

La CI general **Validate CAP Test** sigue con un bloqueo independiente
y conocido del expediente congelado R32 (35 discrepancias, tres con
frecuencia). No se tocaron respuestas, preguntas, algoritmo ni
frecuencias para ocultarlo.

No añadir más capas C41–C50 ni nuevas pruebas sintéticas de testigos.
La siguiente prioridad sigue siendo resolver R32 mediante circuito
editorial autorizado y preparar infraestructura real únicamente cuando
se apruebe; las próximas auditorías de dependencias deben depender
de cambios upstream, no de rondas repetitivas sin beneficio.
