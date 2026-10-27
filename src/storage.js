// Simple IndexedDB wrapper. Works the same in Electron and in a browser.
const DB_NAME = 'hiphtias-blessing';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const storage = {
  putBlob: (key, buf) => tx('blobs', 'readwrite', (s) => s.put(buf, key)),
  getBlob: (key) => tx('blobs', 'readonly', (s) => s.get(key)),
  deleteBlob: (key) => tx('blobs', 'readwrite', (s) => s.delete(key)),
  set: (key, val) => tx('kv', 'readwrite', (s) => s.put(val, key)),
  get: (key) => tx('kv', 'readonly', (s) => s.get(key)),
  del: (key) => tx('kv', 'readwrite', (s) => s.delete(key)),
};

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
