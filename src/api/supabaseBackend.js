// Supabase backend: one table per entity with a jsonb `data` column holding the
// record, plus id / created_date / updated_date columns. Query semantics
// (sort/filter/limit) run in the shared entity layer, so this store only has to
// read/write whole records. File uploads go to a public Storage bucket.

import { createClient } from "@supabase/supabase-js";
import { makeEntity, genId } from "./entityStore";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = "uploads";

export const isSupabaseConfigured = !!(URL && KEY);

// Entity name -> Postgres table name.
const TABLES = {
  InstallationPoint: "installation_point",
  Technician: "technician",
  ChecklistTemplate: "checklist_template",
  ProjectInfo: "project_info",
  Floor: "floor",
  Space: "space",
  User: "app_user",
  LabelTemplate: "label_template",
};

function flat(row) {
  if (!row) return undefined;
  return { ...(row.data || {}), id: row.id, created_date: row.created_date, updated_date: row.updated_date };
}

function split(record) {
  const { id, created_date, updated_date, ...rest } = record;
  return { id, created_date, updated_date, data: rest };
}

function supabaseStore(client, table) {
  return {
    async getAll() {
      const { data, error } = await client.from(table).select("*");
      if (error) throw new Error(error.message);
      return (data || []).map(flat);
    },
    async get(id) {
      const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return flat(data);
    },
    async put(record) {
      const { error } = await client.from(table).upsert(split(record));
      if (error) throw new Error(error.message);
      return record;
    },
    async remove(id) {
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

export function createSupabaseBackend() {
  const client = createClient(URL, KEY);

  const entities = Object.fromEntries(
    Object.entries(TABLES).map(([name, table]) => [name, makeEntity(supabaseStore(client, table))])
  );

  const uploadFile = async ({ file }) => {
    const safe = (file.name || "file").replace(/[^\w.\-]+/g, "_");
    const path = `${genId()}-${safe}`;
    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return { file_url: data.publicUrl };
  };

  return { entities, uploadFile };
}
