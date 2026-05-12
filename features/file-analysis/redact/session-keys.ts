/**
 * features/file-analysis/redact/session-keys.ts
 *
 * IndexedDB-backed cache for reversible-redaction per-session AES-256-GCM
 * keys. Keys are generated server-side ONCE during /redact/mask and never
 * persisted by the backend. The browser is the canonical owner of the key
 * for the security model — only the caller can restore originals.
 *
 * Why IndexedDB instead of localStorage:
 *   - localStorage is synchronous (blocks the main thread for 5 MB blobs).
 *   - localStorage is shared across all tabs of the same origin and
 *     accessible to any in-page script — IDB is too, but IDB is the
 *     spec-recommended bucket for security-sensitive ephemeral data.
 *   - We may want to store thousands of session keys over time (one per
 *     mask operation per doc). IDB scales; localStorage caps at ~5 MB.
 *
 * The store is intentionally minimal — keys can be revoked from the server
 * + dropped from IDB whenever the user finishes a workflow.
 */

const DB_NAME = "matrx-redact-sessions";
const DB_VERSION = 1;
const STORE = "sessions";

interface StoredSession {
  session_id: string;
  session_key_b64: string;
  file_id: string;
  mode: "reversible" | "destructive" | "annotation";
  created_at: number;
  notes?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "session_id" });
        store.createIndex("file_id", "file_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function isBrowser(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveSession(record: StoredSession): Promise<void> {
  if (!isBrowser()) return;
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getSession(
  sessionId: string,
): Promise<StoredSession | null> {
  if (!isBrowser()) return null;
  const db = await open();
  return new Promise<StoredSession | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(sessionId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StoredSession | undefined) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function listSessionsForFile(
  fileId: string,
): Promise<StoredSession[]> {
  if (!isBrowser()) return [];
  const db = await open();
  return new Promise<StoredSession[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("file_id");
    const req = idx.getAll(fileId);
    req.onsuccess = () => {
      db.close();
      const items = (req.result as StoredSession[] | undefined) ?? [];
      items.sort((a, b) => b.created_at - a.created_at);
      resolve(items);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function downloadSessionKey(
  record: StoredSession,
): Promise<void> {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          schema: "matrx.redact.session.v1",
          session_id: record.session_id,
          session_key_b64: record.session_key_b64,
          file_id: record.file_id,
          mode: record.mode,
          created_at: new Date(record.created_at).toISOString(),
          notes:
            record.notes ??
            "This file contains the AES-256-GCM key for a reversible redaction session. " +
              "Keep it safe — without it, the originals cannot be restored. " +
              "Anyone with this key can decrypt the originals of any spans they have read access to.",
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `redact-session-${record.session_id}.key.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type { StoredSession };
