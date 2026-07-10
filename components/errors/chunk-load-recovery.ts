// Stale-chunk detection after a Vercel deploy.
//
// When Vercel ships a new build, content-hashed chunk filenames change and the
// old ones are eventually purged from the CDN. Browser tabs left open across
// the deploy then 404 on those chunks and surface a `ChunkLoadError`.
//
// Policy (see components/errors/FEATURE.md — NEVER reintroduce auto-reload):
//   - PRE-hydration (initial page load, no user state exists yet):
//     ChunkRecoveryBootScript may hard-reload once, loop-guarded.
//   - POST-hydration: we NEVER reload on the user's behalf — a reload destroys
//     unsaved work. Instead we announce the stale chunk via a window event;
//     NewVersionWatcher turns it into a "new version available — Refresh /
//     Not now" toast, and error boundaries render a Refresh *button*.

/** Window event announcing a stale-chunk failure. Detail: { message: string }. */
export const STALE_CHUNK_EVENT = "matrx:stale-chunk";

/** Window flag set by NewVersionWatcher once React has booted. The boot
 *  script checks it to decide reload (pre-boot) vs event (post-boot). */
export const APP_BOOTED_FLAG = "__MATRX_APP_BOOTED__";

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "ChunkLoadError") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to load chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * Announce a stale-chunk failure so NewVersionWatcher can offer the user a
 * refresh. Never reloads. Safe to call unconditionally — no-ops unless the
 * error is chunk-shaped.
 */
export function notifyStaleChunk(error: unknown): void {
  if (typeof window === "undefined") return;
  if (!isChunkLoadError(error)) return;
  const message =
    error instanceof Error ? error.message : String(error ?? "ChunkLoadError");
  window.dispatchEvent(
    new CustomEvent(STALE_CHUNK_EVENT, { detail: { message } }),
  );
}
