/**
 * features/files/hooks/blob-cache.ts
 *
 * Layer 1 (in-memory LRU) of the 3-tier byte cache. Survives React mount /
 * unmount cycles within a session. Without it, closing and reopening a
 * 10MB PDF re-fetches the whole blob over the wire — useFileBlob keeps
 * its blob in component state, so unmount = `URL.revokeObjectURL` +
 * lost bytes.
 *
 * 3-tier read path (see features/files/cache/):
 *   1. In-memory LRU (this module)              — synchronous, session
 *   2. IndexedDB (features/files/cache/idb-store) — persistent, async
 *   3. Network                                   — Python /files/{id}/download
 *
 * Writes populate both tiers when the MIME policy permits IDB persistence
 * (PDFs, ≤50 MB video, ≤100 MB audio, images, etc. — see cache/policy.ts).
 *
 * Design:
 *   - Single `Map<fileId, CacheEntry>`. Map iteration order = insertion
 *     order, so re-inserting on a cache hit gives us LRU for free.
 *   - Capped by total bytes (default 250 MB). When inserts push past
 *     the cap, oldest entries are evicted and their object URLs revoked.
 *   - The cache OWNS the object URL. `useFileBlob` reads `entry.url`
 *     directly and does NOT revoke on unmount — only the cache itself
 *     revokes, on eviction or explicit invalidation.
 *
 * Invalidation hooks:
 *   - `invalidate(fileId)` — single file. Used by upload-version /
 *     restore-version / delete thunks + realtime middleware on
 *     cross-device version inserts. Drops from BOTH tiers.
 *   - `invalidateAll()` — for sign-out / identity swap. Drops in-memory
 *     immediately; pass a userId to also wipe IDB for that user.
 *
 * Why not Redux: Blobs are not serialisable; storing them in the slice
 * would trigger RTK serializableCheck warnings on every dispatch and
 * the full blob would be passed through every middleware. A module-
 * level Map is the right primitive for this.
 */

import {
  deleteEntriesForFile,
  clearForUser,
  getEntry as getIdbEntry,
  putEntry as putIdbEntry,
  type BlobCacheEntry as IdbBlobCacheEntry,
} from "@/features/files/cache/idb-store";
import { shouldPersistInIdb } from "@/features/files/cache/policy";
import {
  postBlobCacheClearUser,
  postBlobCacheInvalidate,
} from "@/features/files/cache/register-service-worker";

let identityUserId: string | null = null;

/**
 * Stamp every subsequent put/invalidate with the current user. Called
 * from the sign-in flow (after Supabase session resolves). Without this
 * IDB entries are written under an empty userId — readable but not
 * scoped, which would leak across user swaps. Memory LRU is unaffected.
 */
export function setBlobCacheIdentity(userId: string | null): void {
  identityUserId = userId;
}

const DEFAULT_BUDGET_BYTES = 250 * 1024 * 1024; // 250 MB total

interface CacheEntry {
  blob: Blob;
  /** `blob:`-scheme URL — owned by the cache; revoked on eviction. */
  url: string;
  /** `blob.size` cached so eviction math doesn't need to re-read. */
  bytes: number;
  /** Last-access timestamp (ms). Updated on cache hits. */
  lastAccessed: number;
}

const cache = new Map<string, CacheEntry>();
let totalBytes = 0;
let budgetBytes = DEFAULT_BUDGET_BYTES;

/**
 * Read a cached entry. Touches the LRU position so re-accesses keep
 * the entry alive. Returns `null` on miss.
 */
export function getCached(fileId: string): CacheEntry | null {
  const entry = cache.get(fileId);
  if (!entry) return null;
  // Bump LRU position by re-inserting at the end of the iteration order.
  cache.delete(fileId);
  entry.lastAccessed = Date.now();
  cache.set(fileId, entry);
  return entry;
}

/**
 * Hydrate the in-memory tier from IndexedDB for a single fileId. Returns
 * the hydrated entry on hit, `null` on miss or when IDB is unavailable.
 *
 * Use this in `useFileBlob`'s effect when the in-memory LRU misses but
 * we want to avoid a network round-trip if the bytes persisted from a
 * previous session.
 */
export async function hydrateFromIdb(fileId: string): Promise<CacheEntry | null> {
  if (!identityUserId) return null;
  try {
    // Read the most recent version's entry. Cache keys embed the version
    // suffix, so we scan with a prefix match via the deleteEntriesForFile
    // family. For now we attempt the "current" key shape; the SW layer
    // (Phase 2) will register canonical (url → key) mappings the page can
    // consult before this read.
    // FIRST-CUT: try the canonical "current" key shape with a wildcard
    // checksum. The IDB store doesn't support prefix queries directly, so
    // we fall back to scanning the user's entries for a matching fileId.
    // This stays O(entries-per-user) which is fine for the realistic upper
    // bound (~hundreds of cached PDFs).
    const { openBlobCacheDb } = await import("@/features/files/cache/idb-store");
    const db = await openBlobCacheDb();
    if (!db) return null;
    const matches = await db.blobs
      .where("userId")
      .equals(identityUserId)
      .and((e: IdbBlobCacheEntry) => e.fileId === fileId)
      .toArray();
    if (matches.length === 0) return null;
    // Prefer the entry with the most recent `lastAccessedAt`.
    const winner = matches.reduce<IdbBlobCacheEntry>(
      (best, candidate) =>
        candidate.lastAccessedAt > best.lastAccessedAt ? candidate : best,
      matches[0],
    );
    // Promote into the in-memory tier so the next read is synchronous.
    const objectUrl = URL.createObjectURL(winner.blob);
    setCachedMemoryOnly(fileId, winner.blob, objectUrl);
    return cache.get(fileId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Insert (or overwrite) a cached entry. The cache takes ownership of
 * `blob` + `url` — callers should NOT revoke the URL themselves.
 *
 * Writes the entry into the in-memory LRU AND (when the MIME policy
 * permits — see `features/files/cache/policy.ts`) into IndexedDB so the
 * bytes survive page reloads.
 *
 * If a previous entry for the same fileId exists, its URL is revoked
 * and the entry is replaced. After insert, the cache evicts oldest
 * entries until the total byte size is under the budget.
 */
export function setCached(
  fileId: string,
  blob: Blob,
  url: string,
  meta?: { mimeType?: string; version?: number | null; checksum?: string | null },
): void {
  setCachedMemoryOnly(fileId, blob, url);
  // Best-effort write to IDB. The promise is intentionally not awaited —
  // the caller's render path is already complete; IDB persistence is a
  // background side-effect that's safe to fail (the in-memory tier is
  // already populated).
  const mime = meta?.mimeType ?? blob.type ?? "application/octet-stream";
  if (identityUserId && shouldPersistInIdb(mime, blob.size)) {
    const version = meta?.version ?? null;
    const checksum = meta?.checksum ?? null;
    const versionSegment = version != null ? String(version) : "current";
    const checksumSegment = checksum ?? "unknown";
    void putIdbEntry({
      key: `${identityUserId}:${fileId}:${versionSegment}:${checksumSegment}`,
      userId: identityUserId,
      fileId,
      version,
      checksum,
      mimeType: mime,
      bytes: blob.size,
      blob,
      etag: checksum,
      fetchedAt: Date.now(),
      lastAccessedAt: Date.now(),
      source: "files-download",
    });
  }
}

function setCachedMemoryOnly(fileId: string, blob: Blob, url: string): void {
  // Replace any existing entry — must revoke the old URL.
  const existing = cache.get(fileId);
  if (existing) {
    URL.revokeObjectURL(existing.url);
    totalBytes -= existing.bytes;
    cache.delete(fileId);
  }

  const entry: CacheEntry = {
    blob,
    url,
    bytes: blob.size,
    lastAccessed: Date.now(),
  };
  cache.set(fileId, entry);
  totalBytes += entry.bytes;

  // Evict oldest entries until the cache is under budget. Map iteration
  // order is insertion order, so the oldest LRU entry is the first key.
  while (totalBytes > budgetBytes && cache.size > 1) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey || oldestKey === fileId) break;
    const oldest = cache.get(oldestKey);
    if (oldest) {
      URL.revokeObjectURL(oldest.url);
      totalBytes -= oldest.bytes;
    }
    cache.delete(oldestKey);
  }
}

/**
 * Drop a single file's cached entry from both tiers. Use this from any
 * code path that makes the cached bytes stale: new-version upload,
 * restore-version, hard-delete, realtime-broadcast cross-device version
 * insert.
 */
export function invalidate(fileId: string): void {
  const entry = cache.get(fileId);
  if (entry) {
    URL.revokeObjectURL(entry.url);
    totalBytes -= entry.bytes;
    cache.delete(fileId);
  }
  // Fire-and-forget: clear every version of this file in IDB AND tell
  // the Service Worker (if registered) to drop its mirror copy of the
  // same fileId. Three tiers, one invalidate() call.
  if (identityUserId) {
    void deleteEntriesForFile(identityUserId, fileId);
  }
  void postBlobCacheInvalidate(fileId);
}

/**
 * Drop every in-memory entry. Use on sign-out / identity swap so the
 * next user can never see the previous user's blob URLs lingering in
 * memory. When `userId` is provided, also clears IDB for that user.
 */
export function invalidateAll(userId?: string): void {
  for (const entry of cache.values()) {
    URL.revokeObjectURL(entry.url);
  }
  cache.clear();
  totalBytes = 0;
  if (userId) {
    void clearForUser(userId);
    void postBlobCacheClearUser(userId);
  }
}

/**
 * Test/debug helper. Useful for diagnostic pages that want to render
 * "blob cache: 3 files, 47 MB / 250 MB".
 */
export function getCacheStats(): {
  entryCount: number;
  totalBytes: number;
  budgetBytes: number;
} {
  return {
    entryCount: cache.size,
    totalBytes,
    budgetBytes,
  };
}

/**
 * Dev/test only — change the size budget at runtime. The default is
 * 250 MB (DEFAULT_BUDGET_BYTES).
 */
export function setBudgetBytes(bytes: number): void {
  budgetBytes = Math.max(0, bytes);
}
