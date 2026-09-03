# NetTrack Pro

Seguimiento de instalaciones de red por **proyectos → pisos → espacios → puntos**, con checklists, planos con pines, reportes en PDF y personalización por proyecto.

La app es un frontend estático con una capa de datos intercambiable:

- **Sin configurar nada** → usa **IndexedDB** del navegador (datos locales por dispositivo). Ideal para probar o uso offline.
- **Con Supabase configurado** → usa una **base de datos compartida en la nube** (Postgres) + Storage para imágenes.

El backend se elige automáticamente según si están las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

> ⚠️ En modo **local** los datos viven solo en ese navegador (no se comparten y se pierden si borras los datos del sitio). Respalda con los PDF. En modo **Supabase** los datos son compartidos por todos los que abren el sitio.

## Conectar Supabase (base de datos compartida)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql). Crea las tablas, el acceso abierto (RLS) y el bucket de imágenes.
3. En Supabase: **Project Settings → API** → copia **Project URL** y la clave **anon public**.
4. Ponlas como variables del despliegue:
   - **GitHub Pages:** repo → **Settings → Secrets and variables → Actions → Variables** → crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Luego re-ejecuta el workflow.
   - **Local:** crea un archivo `.env.local` con esas dos variables.

> ⚠️ **Acceso abierto (sin login):** la clave *anon* va embebida en el sitio y el RLS permite leer/escribir a cualquiera con el enlace. Úsalo solo para una herramienta interna/privada. Para restringirlo hay que añadir Supabase Auth y cambiar las políticas del `schema.sql`.

## Requisitos

- Node.js 18+ y npm.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite. No requiere variables de entorno ni backend.

## Build de producción

```bash
npm run build      # genera dist/ (base "/")
npm run preview    # sirve el build localmente
```

## Publicar en GitHub Pages

El repositorio incluye el workflow `.github/workflows/deploy-pages.yml`, que compila y despliega `dist/` en cada push a `main`.

Pasos únicos en GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Haz push a `main` (o Actions → *Deploy to GitHub Pages* → *Run workflow*).

El sitio queda en `https://<usuario>.github.io/<repo>/`.

La build para Pages calcula el `base` (`/<repo>/`) **automáticamente** a partir de `GITHUB_REPOSITORY` en el workflow, así que **mover el proyecto a otro repo/owner de GitHub no requiere cambios de código**. Para un dominio propio (sitio en la raíz) o un sub-path distinto, define `PAGES_BASE` (ej. `/` o `/otro/`) en el entorno del build.

## Estructura

- `src/api/db.js`: capa de datos (`db.entities.*` CRUD + `db.uploadFile`), respaldada por Supabase o IndexedDB según la configuración.
- `src/lib/queries.js`: hooks de datos con React Query.
- `src/lib/ProjectContext.jsx`: proyecto activo, alcance de datos, branding y terminología.
- `src/pages/`, `src/components/`: UI.
- `src/lib/exportFloorPdf.js`, `src/lib/pdfKit.js`: generación de PDF (jsPDF, carga bajo demanda).
