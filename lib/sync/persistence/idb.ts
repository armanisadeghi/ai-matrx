/**
 * lib/sync/persistence/idb.ts
 *
 * Dexie wrapper for the `warm-cache` tier. Async reads/writes, one database
 * (`matrx-sync`), one object store (`slices`), compound primary key that
 * embeds `version` so a policy version bump naturally orphans old records
 * (Phase 6 adds a reaping pass).
 *
 * Replaces (over time): `lib/idb/*`, `hooks/idb/*`, `audioSafetyStore.ts`,
 * `LocalFileSystem.ts`. Delete trigger: Phase 6 once every consumer is on the
 * sync engine.
 *
 * Failure modes:
 *   - Private browsing / IDB disabled / quota exceeded: `openDb()` rejects →
 *     callers fall back to the localStorage idbFallback path (`matrx:idbFallback:${sliceName}`).
 *     The wrapper never throws; returns null from reads and resolves from
 *     writes even when the backing DB is unavailable.
 */

import Dexie, { type Table } from "dexie";
import { logger } from "../logger";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { extractErrorMessage } from "@/utils/errors";

export const IDB_NAME = "matrx-sync";
export const IDB_SCHEMA_VERSION = 1;
/**
 * Browser IndexedDB requests can remain pending indefinitely (most commonly
 * while a tab is being restored or another context has a blocked upgrade).
 * Persistence is a cache, so it must yield to its localStorage mirror and
 * remote reconciliation rather than keeping sync hydration pending forever.
 */
export const IDB_OPERATION_TIMEOUT_MS = 1_000;

/**
 * Per-slice record. `key` is the compound primary key
 * `${identityKey}:${sliceName}:${version}` — letting the engine:
 *   - Fetch a single record: `db.slices.get(key)`
 *   - Wipe one identity: `db.slices.where("identityKey").equals(...).delete()`
 *   - Wipe one slice (version bump): `db.slices.where("sliceName").equals(...).delete()`
 */
export interface IdbSliceRecord {
  key: string;
  identityKey: string;
  sliceName: string;
  version: number;
  body: unknown;
  persistedAt: number;
}

function hasIndexedDb(): boolean {
  if (typeof globalThis === "undefined") return false;
  return (
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== "undefined"
  );
}

/**
 * Open the Dexie database. Lazy + memoized — only opens on first use so the
 * server-render pass never touches IDB. If IDB is unavailable (private
 * browsing, server, quota exhausted) this resolves to `null` and all
 * subsequent wrapper calls become no-ops.
 */
interface MatrxSyncDb extends Dexie {
  slices: Table<IdbSliceRecord, string>;
}

let dbPromise: Promise<MatrxSyncDb | null> | null = null;

interface IdbConnection {
  db: MatrxSyncDb;
  generation: number;
}

let nextConnectionGeneration = 0;
let activeConnection: IdbConnection | null = null;
const connections = new WeakMap<MatrxSyncDb, IdbConnection>();

function connectionFor(db: MatrxSyncDb): IdbConnection {
  const connection = connections.get(db);
  if (connection) return connection;
  // Test-only hand-built handles are not a production path, but must still
  // receive bounded recovery without being able to invalidate an owned handle.
  return { db, generation: -1 };
}

function invalidateDb(connection: IdbConnection): void {
  // A later retry may already have installed a replacement connection. A
  // delayed timeout from this abandoned handle may close only itself; it must
  // never clear or close the new generation's memoized promise.
  if (activeConnection === connection) {
    activeConnection = null;
    dbPromise = null;
  }
  try {
    connection.db.close();
  } catch {
    // Closing a browser-owned, already-broken IDB connection is best effort.
  }
}

/**
 * A pending IDB request is not a valid reason for the app's persisted-state
 * boot to remain pending. On timeout, abandon this connection so the next
 * operation can make a clean attempt instead of inheriting its stuck queue.
 */
async function completeIdbOperation<T>(
  db: MatrxSyncDb,
  operation: string,
  request: Promise<T>,
): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  const outcome = await Promise.race([
    request.then(
      (value) => ({ type: "value" as const, value }),
      (error) => ({ type: "error" as const, error }),
    ),
    new Promise<{ type: "timeout" }>((resolve) => {
      timeoutHandle = globalThis.setTimeout(
        () => resolve({ type: "timeout" }),
        IDB_OPERATION_TIMEOUT_MS,
      );
    }),
  ]);
  if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);

  if (outcome.type === "value") return outcome.value;
  if (outcome.type === "error") throw outcome.error;

  // This is a recovered, local diagnostic: it stays visible in the Error
  // Inspector even in production, but deliberately never enters system_error
  // / Patrol. The context is bounded operational metadata only — no keys,
  // identities, persisted bodies, or browser storage values.
  captureError({
    source: "runtime-exception",
    code: "sync-idb-operation-timeout",
    message: "[sync] IndexedDB operation timed out; persistence recovery continued.",
    details: `operation=${operation}; timeoutMs=${IDB_OPERATION_TIMEOUT_MS}; generation=${connectionFor(db).generation}`,
    recoverable: true,
    level: "low",
    durable: false,
  });
  invalidateDb(connectionFor(db));
  return null;
}

export function openDb(): Promise<MatrxSyncDb | null> {
  if (dbPromise) return dbPromise;
  if (!hasIndexedDb()) {
    logger.info("idb.unavailable", { meta: { reason: "no-indexedDB" } });
    return Promise.resolve(null);
  }
  const db = new Dexie(IDB_NAME) as MatrxSyncDb;
  const connection: IdbConnection = {
    db,
    generation: ++nextConnectionGeneration,
  };
  connections.set(db, connection);
  activeConnection = connection;
  dbPromise = (async () => {
    try {
      db.version(IDB_SCHEMA_VERSION).stores({
        // Primary key `key` is the compound identity:slice:version.
        // Secondary indexes let us purge by identity or slice.
        slices: "key, identityKey, sliceName",
      });
      const opened = await completeIdbOperation(db, "open", db.open());
      if (opened === null) return null;
      logger.info("idb.open.success", {
        meta: { schemaVersion: IDB_SCHEMA_VERSION },
      });
      return db;
    } catch (err) {
      if (activeConnection === connection) activeConnection = null;
      logger.warn("idb.open.error", {
        meta: { error: extractErrorMessage(err) },
      });
      return null;
    }
  })();
  return dbPromise;
}

/**
 * Reset the memoized DB handle. Test-only; production code never calls this.
 * Exported so `fake-indexeddb` test setups can rebuild between cases.
 */
export function __resetIdbForTests(): void {
  if (dbPromise) {
    void dbPromise.then((db) => {
      try {
        db?.close();
      } catch {
        /* noop */
      }
    });
  }
  dbPromise = null;
  activeConnection = null;
}

function buildKey(
  identityKey: string,
  sliceName: string,
  version: number,
): string {
  return `${identityKey}:${sliceName}:${version}`;
}

/**
 * Read one slice record. Returns null when the DB is unavailable, the record
 * is missing, or the stored record's version doesn't match `version`
 * (version bumps silently discard — see caps on `definePolicy`).
 */
export async function readSlice(
  identityKey: string,
  sliceName: string,
  version: number,
): Promise<IdbSliceRecord | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const record = await completeIdbOperation(
      db,
      "read",
      db.slices.get(buildKey(identityKey, sliceName, version)),
    );
    if (!record) return null;
    if (record.version !== version) {
      // Mismatched version — orphan, treat as missing.
      return null;
    }
    return record;
  } catch (err) {
    logger.warn("idb.read.error", {
      sliceName,
      meta: { error: extractErrorMessage(err) },
    });
    return null;
  }
}

/**
 * Upsert one slice record. Fire-and-forget from the caller's perspective —
 * errors are logged but never propagated, mirroring the sync adapter's
 * contract.
 */
export async function writeSlice(
  identityKey: string,
  sliceName: string,
  version: number,
  body: unknown,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const record: IdbSliceRecord = {
    key: buildKey(identityKey, sliceName, version),
    identityKey,
    sliceName,
    version,
    body,
    persistedAt: Date.now(),
  };
  try {
    const written = await completeIdbOperation(db, "write", db.slices.put(record));
    if (written === null) return;
    logger.debug("idb.write", {
      sliceName,
      meta: { identityKey, version, bytes: approximateBytes(body) },
    });
  } catch (err) {
    logger.warn("idb.write.error", {
      sliceName,
      meta: { error: extractErrorMessage(err) },
    });
  }
}

/** Delete one exact identity/slice/version record without widening the purge. */
export async function deleteSlice(
  identityKey: string,
  sliceName: string,
  version: number,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await completeIdbOperation(
      db,
      "delete",
      db.slices.delete(buildKey(identityKey, sliceName, version)),
    );
  } catch (err) {
    logger.warn("idb.delete.error", {
      sliceName,
      meta: { error: extractErrorMessage(err) },
    });
  }
}

/**
 * Delete every record for one identity. Used when the user signs out or swaps
 * profiles — caches for the old identity must not survive on the device.
 */
export async function clearIdentity(identityKey: string): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  try {
    const count = await completeIdbOperation(
      db,
      "clearIdentity",
      db.slices.where("identityKey").equals(identityKey).delete(),
    );
    logger.info("identity.purge", {
      meta: { fromIdentity: identityKey, recordsRemoved: count },
    });
    return count ?? 0;
  } catch (err) {
    logger.warn("idb.clearIdentity.error", {
      meta: { error: extractErrorMessage(err) },
    });
    return 0;
  }
}

/**
 * Nuke every record. Wipes all identities + slices. Test + admin surface only.
 */
export async function clearAll(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await completeIdbOperation(db, "clearAll", db.slices.clear());
  } catch (err) {
    logger.warn("idb.clearAll.error", {
      meta: { error: extractErrorMessage(err) },
    });
  }
}

/** Rough byte estimate for telemetry. Not exact — just `JSON.stringify(body).length`. */
function approximateBytes(body: unknown): number {
  try {
    return JSON.stringify(body).length;
  } catch {
    return -1;
  }
}
