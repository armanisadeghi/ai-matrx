/**
 * features/files/handler/intelligence/signed-url-cache.ts
 *
 * Lazy in-memory cache for signed URLs. The handler's policy is
 * "mint on demand, never preemptively" — there is no background timer,
 * no expiry wheel, no proactive refresh. Once the bytes are loaded
 * into the browser they stay rendered indefinitely even after the URL
 * expires; the URL only needs to be fresh at the moment something
 * actively asks for it.
 *
 * Responsibilities:
 *   1. Cache `{ url, expiresAt }` per fileId for the page session.
 *   2. Deduplicate concurrent mint requests for the same fileId so 20
 *      images sharing a file produce ONE network call, not 20.
 *   3. Treat URLs as expired a minute before their real S3 expiry so
 *      a download that takes 30s after `getOrMint()` returns still
 *      has a valid signature when it hits S3.
 *   4. Expose `invalidate(fileId)` so an `<img onError>` retry path
 *      (or a permissions-change event) can force a re-mint.
 *
 * This module is intentionally tiny and pure(ish): it knows about the
 * mint function it's given, nothing else. No Redux, no React.
 */

import { mintSignedUrl, type RefreshResult } from "./refresh";

const SAFETY_MARGIN_MS = 60_000;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RefreshResult>>();

function isFresh(
  entry: CacheEntry | undefined,
  now: number,
): entry is CacheEntry {
  return !!entry && entry.expiresAt - SAFETY_MARGIN_MS > now;
}

/**
 * Return a fresh signed URL for `fileId` — from cache if one's still
 * valid, otherwise mint a new one. Concurrent calls for the same
 * fileId share a single in-flight request.
 *
 * The returned `expiresAt` is the real S3 expiry (epoch ms), not the
 * cache's safety-adjusted view. Callers usually don't read it —
 * they just store the URL and trust the cache the next time around.
 */
export async function getOrMintSignedUrl(
  fileId: string,
  expiresInSec?: number,
): Promise<RefreshResult> {
  const now = Date.now();
  const cached = cache.get(fileId);
  if (isFresh(cached, now)) return cached;

  const existing = inflight.get(fileId);
  if (existing) return existing;

  const promise = mintSignedUrl(fileId, expiresInSec)
    .then((fresh) => {
      cache.set(fileId, { url: fresh.url, expiresAt: fresh.expiresAt });
      return fresh;
    })
    .finally(() => {
      inflight.delete(fileId);
    });

  inflight.set(fileId, promise);
  return promise;
}

/**
 * Drop the cached entry for `fileId`. Use when the browser reports a
 * 403 trying to refetch a stale URL (e.g. an `<img onError>`), or when
 * a permissions change makes the cached URL incorrect to serve.
 */
export function invalidateSignedUrl(fileId: string): void {
  cache.delete(fileId);
}

/**
 * Drop every cached URL. Use on sign-out / user switch so a previous
 * user's signed URLs are never handed to a new user. We also clear the
 * in-flight dedup map — otherwise a mint that was in progress at sign-out
 * resolves AFTER the clear and writes the previous user's URL back into
 * the cache, and any concurrent awaiter receives it. That's a (narrow)
 * cross-user session-bleed window this function exists to prevent.
 */
export function clearSignedUrlCache(): void {
  cache.clear();
  inflight.clear();
}

export function _peekCacheForTests(): ReadonlyMap<string, CacheEntry> {
  return cache;
}
