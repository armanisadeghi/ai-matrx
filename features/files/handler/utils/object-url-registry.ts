/**
 * features/files/handler/utils/object-url-registry.ts
 *
 * Bounded registry for ephemeral `URL.createObjectURL` blobs (P1-8).
 *
 * normalize.ts mints object URLs for ephemeral sources (paste, local File,
 * raw buffer). Nothing revoked them, so repeatedly previewing local files
 * leaked blob URLs until the tab was closed — a real driver of mobile
 * memory-pressure crashes.
 *
 * We can't know when a consumer is done with a given URL (it holds the
 * string), so we bound the live set: keep at most MAX_LIVE object URLs and
 * revoke the OLDEST when the cap is exceeded. The cap is generous, so the
 * URL we revoke is the least-recently created and almost certainly no longer
 * on screen — the same LRU bargain the byte blob-cache already makes. This
 * turns an unbounded leak into a fixed ceiling without consumer cooperation.
 */

const MAX_LIVE = 256;

// Insertion-ordered set of live object URLs (Map preserves insertion order).
const live = new Map<string, true>();

/** Create a tracked object URL; evicts the oldest if over the cap. */
export function createTrackedObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  live.set(url, true);
  while (live.size > MAX_LIVE) {
    const oldest = live.keys().next().value as string | undefined;
    if (!oldest) break;
    live.delete(oldest);
    try {
      URL.revokeObjectURL(oldest);
    } catch {
      /* already revoked / invalid — ignore */
    }
  }
  return url;
}

/** Explicitly revoke a tracked URL when a consumer knows it's done. */
export function revokeTrackedObjectUrl(url: string | undefined | null): void {
  if (!url || !live.has(url)) return;
  live.delete(url);
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}
