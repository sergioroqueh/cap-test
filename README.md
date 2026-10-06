# CAP Test 2026

Aplicación web móvil para estudiar y practicar el banco de preguntas CAP 2026.

## Estado de la primera versión

- 8.655 preguntas procedentes de 33 cuestionarios.
- Modo estudio con corrección inmediata.
- Simulacros de 10, 20, 30 o 50 preguntas.
- Repaso inteligente, preguntas nuevas, test de errores y favoritas.
- Login privado con email y contraseña.
- Progreso y estadísticas sincronizados entre dispositivos mediante Supabase + caché local.
- Copia de seguridad e importación del progreso.
- Modo claro/oscuro.
- PWA instalable y preparada para funcionar sin conexión tras la primera carga.

## Tecnología

React + TypeScript + Vite + IndexedDB + Supabase Auth/Database + GitHub Pages.

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


## Login y sincronización

La aplicación usa Supabase Auth con email/contraseña. No ofrece registro público desde la interfaz.

1. Crear un proyecto de Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor.
3. Crear el usuario autorizado en Authentication > Users.
4. Añadir en GitHub > Settings > Secrets and variables > Actions:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

Las políticas RLS limitan cada fila al usuario autenticado propietario. La clave `anon` se usa únicamente como clave pública del cliente; la protección de los datos la aplica RLS en la base de datos.
