-- NetTrack Pro — Supabase schema (OPEN / no-login access)
--
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
--
-- ⚠️ SECURITY: this sets up OPEN access — the public "anon" key (embedded in the
-- static site) can read AND write every table and upload files. That matches the
-- "sin login" choice: anyone with the site URL can change the data. Only use it
-- for a private/internal tool. To lock it down later, switch to Supabase Auth
-- and replace the `using (true)` policies with per-user rules.

-- One table per entity: a jsonb `data` column holds the record; sorting and
-- filtering happen in the app, so no extra columns/indexes are required.
do $$
declare t text;
begin
  foreach t in array array[
    'installation_point','technician','checklist_template','project_info',
    'floor','space','app_user','label_template'
  ]
  loop
    execute format(
      'create table if not exists public.%I (
         id text primary key,
         created_date timestamptz default now(),
         updated_date timestamptz default now(),
         data jsonb not null default ''{}''::jsonb
       )', t);
    execute format('alter table public.%I enable row level security', t);
    -- Grant table privileges to the API roles (independent of the project's
    -- "expose new tables" setting), so the anon key can always reach them.
    execute format('grant all on public.%I to anon, authenticated', t);
    execute format('drop policy if exists public_all on public.%I', t);
    execute format(
      'create policy public_all on public.%I
         for all to anon, authenticated
         using (true) with check (true)', t);
  end loop;
end $$;

-- Public Storage bucket for uploaded images (logos, floor plans, evidence).
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_read on storage.objects;
create policy uploads_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'uploads');

drop policy if exists uploads_write on storage.objects
;
create policy uploads_write on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'uploads');
