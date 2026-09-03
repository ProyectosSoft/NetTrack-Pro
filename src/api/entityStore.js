// Shared entity logic used by both the local (IndexedDB) and the Supabase
// backends. A "store" is the minimal per-entity persistence interface:
//   getAll(): Promise<record[]>
//   get(id):  Promise<record | undefined>
//   put(record): Promise<record>   // upsert by id
//   remove(id): Promise<void>
// makeEntity() turns that into the entity API the app consumes (list/filter/get/
// create/update/delete/deleteMany/importMany), so query semantics (ordering,
// filtering, limiting, merge-on-update) are identical regardless of where the
// data lives.

export function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Orders by a "field" (ascending) or "-field" (descending) string.
export function sortRecords(records, order) {
  if (!order) return records;
  const desc = order.startsWith("-");
  const field = desc ? order.slice(1) : order;
  return [...records].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    const cmp = av < bv ? -1 : 1;
    return desc ? -cmp : cmp;
  });
}

export function matches(record, query) {
  return Object.entries(query || {}).every(([k, v]) => record[k] === v);
}

export function makeEntity(store) {
  return {
    async list(order, limit) {
      const rows = sortRecords(await store.getAll(), order);
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },
    async filter(query = {}, order, limit) {
      const rows = sortRecords((await store.getAll()).filter((r) => matches(r, query)), order);
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },
    get(id) {
      return store.get(id);
    },
    create(data) {
      const now = new Date().toISOString();
      const record = { ...data, id: genId(), created_date: now, updated_date: now };
      return store.put(record);
    },
    async update(id, data) {
      const existing = (await store.get(id)) || { id };
      const record = { ...existing, ...data, id, updated_date: new Date().toISOString() };
      return store.put(record);
    },
    delete(id) {
      return store.remove(id);
    },
    async deleteMany(query = {}) {
      const hits = (await store.getAll()).filter((r) => matches(r, query));
      for (const h of hits) await store.remove(h.id);
      return { deleted: hits.length };
    },
    // Bulk upsert preserving each record's own id (and created/updated dates when
    // present). Used by the import tool; a full overwrite, no read-merge.
    async importMany(records) {
      let n = 0;
      const now = new Date().toISOString();
      for (const rec of records) {
        if (!rec || !rec.id) continue;
        await store.put({ created_date: now, updated_date: now, ...rec });
        n += 1;
      }
      return n;
    },
  };
}
