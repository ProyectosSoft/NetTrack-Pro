// App data client. Exposes `db.entities.<Name>` CRUD and `db.uploadFile`, backed
// by either Supabase (shared cloud database + Storage) when
// VITE_SUPABASE_URL/ANON_KEY are configured, or the browser's IndexedDB (local,
// per-device) otherwise. The rest of the app is unaware of which backend is used.

import { createLocalBackend } from "./localBackend";
import { createSupabaseBackend, isSupabaseConfigured } from "./supabaseBackend";

const backend = isSupabaseConfigured ? createSupabaseBackend() : createLocalBackend();

export const usingSupabase = isSupabaseConfigured;

export const db = {
  entities: backend.entities,
  uploadFile: backend.uploadFile,
};
