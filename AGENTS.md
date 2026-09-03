# AGENTS.md

## Project Context

NetTrack Pro is a **backend-free React + Vite single-page app** for tracking
network installations (projects → floors → spaces → points), published as a
static site on GitHub Pages. There is no server: data and uploaded images live
in the browser via **IndexedDB**, or in a shared **Supabase** database + Storage
when configured. Keep changes focused on the user's request and preserve
existing project conventions.

Start with `README.md` for local setup, the Supabase connection, and the
GitHub Pages publish workflow.

## Key Files

- `src/`: application source.
- `src/api/db.js`: the data client — selects Supabase or IndexedDB at runtime.
  - `src/api/entityStore.js`: shared entity logic (list/filter/get/create/update/
    delete/deleteMany/importMany) over a small store interface.
  - `src/api/supabaseBackend.js`, `src/api/localBackend.js`: the two backends.
- `src/lib/queries.js`: React Query hooks over `db`.
- `src/lib/ProjectContext.jsx`: active project, data scoping, branding, terminology.
- `supabase/schema.sql`: tables, RLS policies and Storage bucket for Supabase.
- `vite.config.js`: Vite config (`@` → `src` alias, GitHub Pages base, PWA).
- `.env.local`: local-only Supabase values; never commit secrets.

## Working Notes

- `npm run dev` runs the app locally (no backend needed; uses IndexedDB unless
  `.env.local` has Supabase values). `npm run build` / `npm run preview` for prod.
- All data access goes through `db.entities.<Name>` and `db.uploadFile`; reuse
  that surface rather than importing a backend directly.
- Run the relevant checks from `package.json` (`npm run lint`, `npm run build`)
  before finishing code changes.
