// Local, browser-only backend: one IndexedDB object store per entity, and file
// uploads kept inline as data URLs. Used for development and whenever Supabase
// is not configured.

import { makeEntity } from "./entityStore";

const DB_NAME = "nettrack";
const DB_VERSION = 1;
const STORES = [
  "InstallationPoint",
  "Technician",
  "ChecklistTemplate",
  "ProjectInfo",
  "Floor",
  "Space",
  "User",
  "LabelTemplate",
];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function idbStore(name) {
  return {
    async getAll() {
      const db = await openDb();
      return reqP(db.transaction(name, "readonly").objectStore(name).getAll());
    },
    async get(id) {
      const db = await openDb();
      return reqP(db.transaction(name, "readonly").objectStore(name).get(id));
    },
    async put(record) {
      const db = await openDb();
      const t = db.transaction(name, "readwrite");
      t.objectStore(name).put(record);
      await txDone(t);
      return record;
    },
    async remove(id) {
      const db = await openDb();
      const t = db.transaction(name, "readwrite");
      t.objectStore(name).delete(id);
      await txDone(t);
    },
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function createLocalBackend() {
  const entities = Object.fromEntries(STORES.map((s) => [s, makeEntity(idbStore(s))]));
  const uploadFile = async ({ file }) => ({ file_url: await fileToDataUrl(file) });
  return { entities, uploadFile };
}
