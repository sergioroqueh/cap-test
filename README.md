# CAP Test 2026

Aplicación web móvil para estudiar y practicar el banco de preguntas CAP 2026.

## Estado de la primera versión

- 8.655 preguntas procedentes de 33 cuestionarios.
- Modo estudio con corrección inmediata.
- Simulacros de 10, 20, 30 o 50 preguntas.
- Repaso inteligente, preguntas nuevas, test de errores y favoritas.
- Progreso y estadísticas guardados localmente en el dispositivo.
- Copia de seguridad e importación del progreso.
- Modo claro/oscuro.
- PWA instalable y preparada para funcionar sin conexión tras la primera carga.

## Tecnología

React + TypeScript + Vite + IndexedDB + GitHub Pages.

## Desarrollo

```bash
npm install
npm run dev
```

El paso `prepare:data` genera automáticamente los JSON de la aplicación a partir del banco fuente comprimido y valida que existan exactamente 8.655 preguntas y 33 cuestionarios.

## Compilación

```bash
npm run build
```

La publicación se realiza mediante GitHub Actions sobre GitHub Pages.

> CAP Test es una herramienta de estudio basada en el material aportado al proyecto. No es una aplicación oficial de la DGT ni de una administración pública.
