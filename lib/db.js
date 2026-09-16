// Local storage for the latest screenshot and the latest screen recording.
// IndexedDB stores Blobs on disk, so long recordings do not fill memory.

const DB_NAME = "dev-toolkit-for-odoo";
const DB_VERSION = 2;
const CAPTURES = "captures";
const RECORDINGS = "recordings"; // metadata, key = recording id
const CHUNKS = "chunks"; // video chunks, key = "<id>:<seq>"

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [CAPTURES, RECORDINGS, CHUNKS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    work(t, (value) => (result = value));
    t.oncomplete = () => {
      db.close();
      resolve(result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

const chunkKey = (id, seq) => `${id}:${String(seq).padStart(7, "0")}`;
const chunkRange = (id) => IDBKeyRange.bound(`${id}:`, `${id}:\uffff`);

/* ---------------- Screenshots ---------------- */

// Keeps only the latest capture.
export function saveCapture(id, record) {
  return tx([CAPTURES], "readwrite", (t) => {
    const store = t.objectStore(CAPTURES);
    store.clear();
    store.put(record, id);
  });
}

export function getCapture(id) {
  return tx([CAPTURES], "readonly", (t, done) => {
    const req = t.objectStore(CAPTURES).get(id);
    req.onsuccess = () => done(req.result);
  });
}

/* ---------------- Recordings ---------------- */

// Removes the previous recording so only the latest one is kept.
export function clearRecordings() {
  return tx([RECORDINGS, CHUNKS], "readwrite", (t) => {
    t.objectStore(RECORDINGS).clear();
    t.objectStore(CHUNKS).clear();
  });
}

export function putChunk(id, seq, blob) {
  return tx([CHUNKS], "readwrite", (t) => t.objectStore(CHUNKS).put(blob, chunkKey(id, seq)));
}

export function finishRecording(id, meta) {
  return tx([RECORDINGS], "readwrite", (t) => t.objectStore(RECORDINGS).put(meta, id));
}

export function getRecording(id) {
  return tx([RECORDINGS, CHUNKS], "readonly", (t, done) => {
    const out = { meta: null, chunks: [] };
    const m = t.objectStore(RECORDINGS).get(id);
    m.onsuccess = () => (out.meta = m.result || null);
    const c = t.objectStore(CHUNKS).getAll(chunkRange(id));
    c.onsuccess = () => {
      out.chunks = c.result || [];
      done(out);
    };
  });
}
