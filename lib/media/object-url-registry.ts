/**
 * Shared bounded registry for ephemeral `URL.createObjectURL` blobs.
 *
 * Consumers that create local blob URLs use this primitive so previews cannot
 * leak memory without bound. Explicit cleanup remains preferred; the global
 * ceiling is a final safety net for callers that no longer own their URL.
 */

const MAX_LIVE = 256;
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
      // The browser may already have revoked an invalid URL.
    }
  }
  return url;
}

/** Explicitly revoke a tracked URL when a consumer knows it is finished. */
export function revokeTrackedObjectUrl(url: string | undefined | null): void {
  if (!url || !live.has(url)) return;
  live.delete(url);
  try {
    URL.revokeObjectURL(url);
  } catch {
    // The browser may already have revoked an invalid URL.
  }
}
