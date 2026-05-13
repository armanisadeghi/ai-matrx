/**
 * features/files/cache/idb-store.ts
 *
 * IndexedDB tier of the 3-tier byte cache (memory LRU → IDB → network).
 *
 * Dexie wrapper for the `matrx-blob-cache` database — a SEPARATE DB from
 * `matrx-sync` so cache eviction can never threaten sync persistence.
 * Schema is intentionally simple: one `blobs` table keyed by a string
 * cache key, indexed by `userId` (for sign-out purge) and
 * `lastAccessedAt` (for LRU eviction).
 *
 * Cache key strategy (see plan §4A):
 *   - Owned files (current version): `${userId}:${fileId}:current:${checksum}`
 *   - Owned files (pinned version):  `${userId}:${fileId}:${N}:${checksum}`
 *   - URL-keyed entries (share-link bytes, etc.): `${userId}:url:${sha256(url)}`
 *
 * Signed S3 URLs (anything carrying `X-Amz-Signature`) are NEVER cached
 * because they expire — caching them would create stale-URL bugs.
 *
 * Failure modes:
 *   - Private browsing / IDB disabled / quota exceeded: `openBlobCacheDb()`
 *     rejects → all reads return null, all writes resolve as no-ops. The
 *     in-memory LRU + network stay functional.
 *
 * Identity scoping:
 *   - Every entry is stamped with `userId`. Sign-out calls `clearForUser`
 *     so cross-user contamination is structurally impossible.
 *
 * Budget:
 *   - Default 2 GB total. Eviction is size-aware-LRU: oldest entries above
 *     a 2 MB floor are evicted first; tiny entries (<2 MB) only evict when
 *     the cache is otherwise full of small entries.
 *   - QuotaExceededError triggers an immediate eviction down to 70% of
 *     budget and a single retry. Subsequent failures fall back to network.
 */

import Dexie, { type Table } from "dexie";
import { logger } from "@/lib/sync/logger";
import { extractErrorMessage } from "@/utils/errors";

export const BLOB_CACHE_DB_NAME = "matrx-blob-cache";
export const BLOB_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_BUDGET_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const SIZE_FLOOR_BYTES = 2 * 1024 * 1024; // 2 MB — evict bigger entries first

export type BlobCacheSource =
  | "files-download"
  | "share"
  | "cdn"
  | "url";

export interface BlobCacheEntry {
  /** Composite cache key — see header comment for the key shape. */
  key: string;
  userId: string;
  /** Null for url-keyed entries (share links / arbitrary URLs). */
  fileId: string | null;
  version: number | null;
  checksum: string | null;
  mimeType: string;
  bytes: number;
  blob: Blob;
  etag: string | null;
  fetchedAt: number;
  lastAccessedAt: number;
  source: BlobCacheSource;
}

interface BlobCacheDb extends Dexie {
  blobs: Table<BlobCacheEntry, string>;
}

function hasIndexedDb(): boolean {
  if (typeof globalThis === "undefined") return false;
  return typeof (globalThis as { indexedDB?: unknown }).indexedDB !== "undefined";
}

let dbPromise: Promise<BlobCacheDb | null> | null = null;

/**
 * Open the Dexie blob-cache DB. Lazy + memoized — the server-render pass
 * never touches IDB. Returns `null` when IDB is unavailable (private
 * browsing, server-side, quota exhausted at open time); callers should
 * treat that as "no persistent tier" and fall through to network.
 */
export function openBlobCacheDb(): Promise<BlobCacheDb | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    if (!hasIndexedDb()) {
      logger.info("blob-cache.unavailable", {
        meta: { reason: "no-indexedDB" },
      });
      return null;
    }
    try {
      const db = new Dexie(BLOB_CACHE_DB_NAME) as BlobCacheDb;
      db.version(BLOB_CACHE_SCHEMA_VERSION).stores({
        // Primary key `key`; secondary indexes for purge + eviction.
        blobs: "key, userId, lastAccessedAt, bytes",
      });
      await db.open();
      logger.info("blob-cache.open.success", {
        meta: { schemaVersion: BLOB_CACHE_SCHEMA_VERSION },
      });
      return db;
    } catch (err) {
      logger.warn("blob-cache.open.error", {
        meta: { error: extractErrorMessage(err) },
      });
      return null;
    }
  })();
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export async function getEntry(key: string): Promise<BlobCacheEntry | null> {
  const db = await openBlobCacheDb();
  if (!db) return null;
  try {
    const entry = await db.blobs.get(key);
    if (!entry) return null;
    // Bump LRU position. Fire-and-forget — the read result is already
    // returned, and a missed lastAccessedAt bump just shortens this entry's
    // lifetime in the next eviction pass (acceptable).
    void db.blobs.update(key, { lastAccessedAt: Date.now() });
    return entry;
  } catch (err) {
    logger.warn("blob-cache.read.error", {
      meta: { key, error: extractErrorMessage(err) },
    });
    return null;
  }
}

export async function putEntry(entry: BlobCacheEntry): Promise<void> {
  const db = await openBlobCacheDb();
  if (!db) return;
  try {
    await db.blobs.put(entry);
    // Best-effort eviction pass. If quota is exhausted we'll catch and
    // retry the put once after an emergency eviction.
  } catch (err) {
    // Quota-exceeded: try to free space, retry once, then give up.
    if (isQuotaExceeded(err)) {
      try {
        await evictToBudget(db, entry.userId, DEFAULT_BUDGET_BYTES * 0.7);
        await db.blobs.put(entry);
      } catch (retryErr) {
        logger.warn("blob-cache.write.quota-exceeded", {
          meta: { key: entry.key, error: extractErrorMessage(retryErr) },
        });
      }
      return;
    }
    logger.warn("blob-cache.write.error", {
      meta: { key: entry.key, error: extractErrorMessage(err) },
    });
  }
}

export async function deleteEntry(key: string): Promise<void> {
  const db = await openBlobCacheDb();
  if (!db) return;
  try {
    await db.blobs.delete(key);
  } catch (err) {
    logger.warn("blob-cache.delete.error", {
      meta: { key, error: extractErrorMessage(err) },
    });
  }
}

/**
 * Drop every entry whose key starts with `${userId}:${fileId}:`. Use on
 * realtime version-bump / hard-delete so every cached version of a file
 * gets evicted regardless of the version segment in the key.
 */
export async function deleteEntriesForFile(
  userId: string,
  fileId: string,
): Promise<void> {
  const db = await openBlobCacheDb();
  if (!db) return;
  try {
    await db.blobs.where("userId").equals(userId).and((entry) => entry.fileId === fileId).delete();
  } catch (err) {
    logger.warn("blob-cache.delete-for-file.error", {
      meta: { userId, fileId, error: extractErrorMessage(err) },
    });
  }
}

/**
 * Drop every entry for the signed-out user. Called from the sign-out
 * code path so the next user can never read the previous user's blobs.
 */
export async function clearForUser(userId: string): Promise<void> {
  const db = await openBlobCacheDb();
  if (!db) return;
  try {
    await db.blobs.where("userId").equals(userId).delete();
  } catch (err) {
    logger.warn("blob-cache.clear-for-user.error", {
      meta: { userId, error: extractErrorMessage(err) },
    });
  }
}

/**
 * Test/debug helper. Returns `{ entryCount, totalBytes }`. The admin
 * observability panel reads this.
 */
export async function getStats(): Promise<{ entryCount: number; totalBytes: number }> {
  const db = await openBlobCacheDb();
  if (!db) return { entryCount: 0, totalBytes: 0 };
  try {
    let count = 0;
    let total = 0;
    await db.blobs.each((entry) => {
      count += 1;
      total += entry.bytes;
    });
    return { entryCount: count, totalBytes: total };
  } catch {
    return { entryCount: 0, totalBytes: 0 };
  }
}

// ---------------------------------------------------------------------------
// Eviction
// ---------------------------------------------------------------------------

function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return e.name === "QuotaExceededError" || e.code === 22;
}

/**
 * Evict entries (size-aware-LRU) for `userId` until total bytes ≤ target.
 *
 * Strategy: entries are sorted by `(bytes >= SIZE_FLOOR_BYTES, lastAccessedAt)`
 * so large stale entries go first; small entries only get evicted once the
 * large pile is gone. Stops when the per-user total drops below `targetBytes`.
 */
async function evictToBudget(
  db: BlobCacheDb,
  userId: string,
  targetBytes: number,
): Promise<void> {
  const entries = await db.blobs
    .where("userId")
    .equals(userId)
    .toArray();
  const ordered = entries.sort((a, b) => {
    const aBig = a.bytes >= SIZE_FLOOR_BYTES ? 0 : 1;
    const bBig = b.bytes >= SIZE_FLOOR_BYTES ? 0 : 1;
    if (aBig !== bBig) return aBig - bBig;
    return a.lastAccessedAt - b.lastAccessedAt;
  });
  let total = ordered.reduce((sum, e) => sum + e.bytes, 0);
  const toDelete: string[] = [];
  for (const entry of ordered) {
    if (total <= targetBytes) break;
    toDelete.push(entry.key);
    total -= entry.bytes;
  }
  if (toDelete.length > 0) {
    await db.blobs.bulkDelete(toDelete);
    logger.info("blob-cache.evicted", {
      meta: { userId, evicted: toDelete.length, totalAfter: total },
    });
  }
}

/**
 * Public LRU evict for a given user — exposed so the admin observability
 * panel can offer an "Evict now" button.
 */
export async function evictForUser(userId: string, targetBytes: number): Promise<void> {
  const db = await openBlobCacheDb();
  if (!db) return;
  await evictToBudget(db, userId, targetBytes);
}
