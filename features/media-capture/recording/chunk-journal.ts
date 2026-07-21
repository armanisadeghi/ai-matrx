/**
 * features/media-capture/recording/chunk-journal.ts
 *
 * Crash-safety journal for in-flight recordings: chunk-per-record IndexedDB
 * (plan §2 locked decision 6). Framework-free, raw IndexedDB — the audio
 * safety store's array-in-one-record design is a behavior REFERENCE only and
 * is not suitable for large video.
 *
 * DB `mtx-capture-journal`:
 *   - store `chunks`   — keyed [capture_id, sequence], one Blob per record.
 *   - store `manifests`— keyed capture_id: status / mime / emitted_bytes /
 *     created_at / expires_at / last_sequence / source_feature.
 *
 * Durability contract (plan §5 invariant 11): durability is promised ONLY for
 * chunks the browser actually emitted. The manifest distinguishes `finalized`
 * (recorder completed; chunk set is whole) from `recording` (interrupted —
 * whatever is present is all there is). Recovery reads report exactly what
 * was found vs what the manifest last saw, and incomplete recovery is LOUD.
 *
 * Quota: `navigator.storage.estimate()` preflight on journal creation — a
 * start below the safety margin is rejected with a typed StorageQuotaError
 * (terminal `storage-quota`), never a mid-recording silent write failure.
 *
 * NOTE: the TUS resume-URL store is a SEPARATE tiny DB (`mtx-tus-urls`,
 * features/files/upload/tusUpload.ts) — never merge the two.
 */

const DB_NAME = "mtx-capture-journal";
const DB_VERSION = 1;
const CHUNKS_STORE = "chunks";
const MANIFESTS_STORE = "manifests";

/** Default retention for un-recovered journals: 48h. */
export const JOURNAL_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Minimum free storage (beyond the recording's own expected footprint) we
 *  require before allowing a recording to start. */
export const JOURNAL_MIN_FREE_BYTES = 256 * 1024 * 1024; // 256 MiB
/**
 * Preflight cap on the expected-bytes demand. A recording's true ceiling
 * (`maxBytes`) is enforced DURING capture by the recorder's hard stop; the
 * preflight only needs to prove a sane runway exists. Demanding the full
 * ceiling up front (e.g. 4 GiB) false-rejects short recordings on
 * storage-constrained devices (mobile Safari quotas).
 */
export const JOURNAL_PREFLIGHT_EXPECTED_CAP_BYTES = 512 * 1024 * 1024; // 512 MiB

export type JournalStatus = "recording" | "finalized" | "discarded";

export interface JournalManifest {
  capture_id: string;
  status: JournalStatus;
  /** Authoritative MIME as last reported (updated at finalize). */
  mime: string | null;
  /** Total bytes across appended chunks. */
  emitted_bytes: number;
  created_at: number; // epoch ms
  expires_at: number; // epoch ms
  /** Highest sequence appended, or -1 when no chunk landed. */
  last_sequence: number;
  source_feature: string;
  /** Whether the recording carried audio (video captures); null = unknown. */
  has_audio: boolean | null;
}

export interface RecoverableJournal {
  manifest: JournalManifest;
  /** True when the recorder never finalized — the chunk set is a partial. */
  interrupted: boolean;
}

export interface JournalReadResult {
  manifest: JournalManifest;
  /** Chunks in sequence order. */
  chunks: Blob[];
  /** Sequences the manifest saw but the store no longer holds (LOUD gap). */
  missingSequences: number[];
  /** expected = manifest.last_sequence + 1. */
  expectedChunks: number;
}

export class StorageQuotaError extends Error {
  constructor(availableBytes: number | null, requiredBytes: number) {
    super(
      `[chunk-journal] not enough storage to record safely — need at least ` +
        `${Math.round(requiredBytes / (1024 * 1024))} MiB free, ` +
        `${availableBytes === null ? "available space unknown" : `~${Math.round(availableBytes / (1024 * 1024))} MiB available`}. ` +
        `Free up space and try again.`,
    );
    this.name = "StorageQuotaError";
  }
}

// ─── Low-level IndexedDB plumbing ────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("[chunk-journal] IndexedDB is unavailable here."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, {
          keyPath: ["capture_id", "sequence"],
        });
      }
      if (!db.objectStoreNames.contains(MANIFESTS_STORE)) {
        db.createObjectStore(MANIFESTS_STORE, { keyPath: "capture_id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () =>
      reject(req.error ?? new Error("[chunk-journal] failed to open DB"));
    req.onblocked = () =>
      reject(new Error("[chunk-journal] DB open blocked by another tab"));
  });
  dbPromise.catch(() => {
    dbPromise = null; // allow a retry after a failed open
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

/** Chunks are stored as raw bytes + MIME (not Blob objects) — maximally
 *  portable across IDB implementations and structured-clone quirks. */
interface ChunkRecord {
  capture_id: string;
  sequence: number;
  bytes: ArrayBuffer;
  type: string;
}

async function getManifest(captureId: string): Promise<JournalManifest | null> {
  const db = await openDb();
  const tx = db.transaction(MANIFESTS_STORE, "readonly");
  const result = await requestToPromise(
    tx.objectStore(MANIFESTS_STORE).get(captureId) as IDBRequest<
      JournalManifest | undefined
    >,
  );
  return result ?? null;
}

async function putManifest(manifest: JournalManifest): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MANIFESTS_STORE, "readwrite");
  tx.objectStore(MANIFESTS_STORE).put(manifest);
  await txDone(tx);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CreateJournalMeta {
  /** Requested/confirmed recording MIME (refined at finalize). */
  mime: string | null;
  sourceFeature: string;
  /** Whether the recording carries audio. */
  hasAudio?: boolean;
  retentionMs?: number;
  /** Expected footprint of the recording (for the quota preflight). 0 = only
   *  the base safety margin is required. */
  expectedBytes?: number;
  /** DI for tests. */
  estimateStorage?: () => Promise<{ usage?: number; quota?: number }>;
}

/**
 * Create a journal for a new capture. Runs the storage-quota preflight and
 * REJECTS with `StorageQuotaError` when the browser can't safely hold the
 * recording — the caller surfaces this as the `storage-quota` terminal error
 * BEFORE any recording starts.
 */
export async function createJournal(
  captureId: string,
  meta: CreateJournalMeta,
): Promise<JournalManifest> {
  const estimate =
    meta.estimateStorage ??
    (typeof navigator !== "undefined" && navigator.storage?.estimate
      ? () => navigator.storage.estimate()
      : null);
  const required =
    JOURNAL_MIN_FREE_BYTES +
    Math.min(meta.expectedBytes ?? 0, JOURNAL_PREFLIGHT_EXPECTED_CAP_BYTES);
  if (estimate) {
    let available: number | null = null;
    try {
      const { usage, quota } = await estimate();
      if (typeof quota === "number") {
        available = quota - (usage ?? 0);
      }
    } catch {
      available = null; // estimate unavailable — do not block on it
    }
    if (available !== null && available < required) {
      throw new StorageQuotaError(available, required);
    }
  }

  const nowMs = Date.now();
  const manifest: JournalManifest = {
    capture_id: captureId,
    status: "recording",
    mime: meta.mime,
    emitted_bytes: 0,
    created_at: nowMs,
    expires_at: nowMs + (meta.retentionMs ?? JOURNAL_RETENTION_MS),
    last_sequence: -1,
    source_feature: meta.sourceFeature,
    has_audio: meta.hasAudio ?? null,
  };
  await putManifest(manifest);
  return manifest;
}

/** Blob → ArrayBuffer with a FileReader fallback (jsdom's Blob lacks
 *  `arrayBuffer()`; every real browser has one path or the other). */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsArrayBuffer(blob);
  });
}

/** Append one emitted chunk. Chunk write + manifest bump are one transaction. */
export async function appendChunk(
  captureId: string,
  sequence: number,
  blob: Blob,
): Promise<void> {
  const bytes = await blobToArrayBuffer(blob);
  const db = await openDb();
  const tx = db.transaction([CHUNKS_STORE, MANIFESTS_STORE], "readwrite");
  const record: ChunkRecord = {
    capture_id: captureId,
    sequence,
    bytes,
    type: blob.type,
  };
  tx.objectStore(CHUNKS_STORE).put(record);
  const manifestStore = tx.objectStore(MANIFESTS_STORE);
  const existing = await requestToPromise(
    manifestStore.get(captureId) as IDBRequest<JournalManifest | undefined>,
  );
  if (!existing) {
    throw new Error(
      `[chunk-journal] appendChunk for unknown capture "${captureId}" — createJournal first.`,
    );
  }
  manifestStore.put({
    ...existing,
    emitted_bytes: existing.emitted_bytes + blob.size,
    last_sequence: Math.max(existing.last_sequence, sequence),
  } satisfies JournalManifest);
  await txDone(tx);
}

/**
 * Mark the journal finalized (recorder completed; chunk set is whole).
 * IDEMPOTENT — re-finalizing a finalized journal is a no-op; finalizing a
 * discarded journal stays discarded (loud warn — a real ordering bug).
 */
export async function finalizeJournal(
  captureId: string,
  finalMime?: string | null,
): Promise<JournalManifest | null> {
  const existing = await getManifest(captureId);
  if (!existing) return null;
  if (existing.status === "discarded") {
    console.warn(
      `[chunk-journal] finalizeJournal("${captureId}") after discard — keeping discarded.`,
    );
    return existing;
  }
  if (existing.status === "finalized" && finalMime === undefined) {
    return existing;
  }
  const next: JournalManifest = {
    ...existing,
    status: "finalized",
    mime: finalMime !== undefined ? finalMime : existing.mime,
  };
  await putManifest(next);
  return next;
}

/** Delete a capture's chunks + manifest entirely (cancel / takeover / saved). */
export async function discardJournal(captureId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([CHUNKS_STORE, MANIFESTS_STORE], "readwrite");
  tx.objectStore(CHUNKS_STORE).delete(
    IDBKeyRange.bound([captureId, -Infinity], [captureId, Infinity]),
  );
  tx.objectStore(MANIFESTS_STORE).delete(captureId);
  await txDone(tx);
}

/**
 * List journals eligible for recovery: not discarded, not expired, and with
 * at least one durable chunk. `interrupted: true` marks journals whose
 * recorder never finalized — the recovered output is explicitly partial.
 */
export async function listRecoverable(): Promise<RecoverableJournal[]> {
  const db = await openDb();
  const tx = db.transaction(MANIFESTS_STORE, "readonly");
  const all = await requestToPromise(
    tx.objectStore(MANIFESTS_STORE).getAll() as IDBRequest<JournalManifest[]>,
  );
  const nowMs = Date.now();
  return all
    .filter(
      (m) =>
        m.status !== "discarded" &&
        m.expires_at > nowMs &&
        m.last_sequence >= 0,
    )
    .sort((a, b) => b.created_at - a.created_at)
    .map((manifest) => ({
      manifest,
      interrupted: manifest.status !== "finalized",
    }));
}

/**
 * Read a capture's chunks in sequence order. Reports LOUDLY what was found vs
 * what the manifest last recorded — recovery only ever promises emitted
 * chunks, and a gap is surfaced, never papered over.
 */
export async function readChunks(captureId: string): Promise<JournalReadResult> {
  const manifest = await getManifest(captureId);
  if (!manifest) {
    throw new Error(
      `[chunk-journal] readChunks("${captureId}"): no manifest — nothing recoverable.`,
    );
  }
  const db = await openDb();
  const tx = db.transaction(CHUNKS_STORE, "readonly");
  const records = await requestToPromise(
    tx
      .objectStore(CHUNKS_STORE)
      .getAll(
        IDBKeyRange.bound([captureId, -Infinity], [captureId, Infinity]),
      ) as IDBRequest<ChunkRecord[]>,
  );
  records.sort((a, b) => a.sequence - b.sequence);
  const present = new Set(records.map((r) => r.sequence));
  const missingSequences: number[] = [];
  for (let s = 0; s <= manifest.last_sequence; s++) {
    if (!present.has(s)) missingSequences.push(s);
  }
  if (missingSequences.length > 0) {
    console.error(
      `[chunk-journal] capture "${captureId}" is missing ${missingSequences.length} of ` +
        `${manifest.last_sequence + 1} journaled chunk(s) — recovery will be partial.`,
    );
  }
  return {
    manifest,
    chunks: records.map((r) => new Blob([r.bytes], { type: r.type })),
    missingSequences,
    expectedChunks: manifest.last_sequence + 1,
  };
}

/** Purge expired and discarded journals (chunks + manifests). Returns the
 *  number of journals removed. */
export async function purgeExpired(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(MANIFESTS_STORE, "readonly");
  const all = await requestToPromise(
    tx.objectStore(MANIFESTS_STORE).getAll() as IDBRequest<JournalManifest[]>,
  );
  const nowMs = Date.now();
  const dead = all.filter(
    (m) => m.status === "discarded" || m.expires_at <= nowMs,
  );
  for (const m of dead) {
    await discardJournal(m.capture_id);
  }
  return dead.length;
}

/** Test-only escape hatch: close + delete the whole DB. */
export async function __resetJournalDb(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      // ignore
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
