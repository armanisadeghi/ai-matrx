// Chunk-load failure detection and recovery.
//
// When Vercel ships a new build, content-hashed chunk filenames change and the
// old ones are eventually purged from the CDN. Browser tabs left open across
// the deploy can then 404 on those chunks and surface a `ChunkLoadError`.
// Deploy skew is only one possible cause, so this module never infers it from a
// generic runtime error and user-facing recovery copy never claims it.
//
// Policy (see components/errors/FEATURE.md — NEVER reintroduce auto-reload):
//   - PRE-hydration (initial page load, no user state exists yet):
//     ChunkRecoveryBootScript may hard-reload once, loop-guarded.
//   - POST-hydration: we NEVER reload on the user's behalf — a reload destroys
//     unsaved work. Instead we announce the chunk failure via a window event;
//     NewVersionWatcher turns it into a cause-neutral "failed to load —
//     Refresh / Not now" toast, and error boundaries render a Refresh button.

/** Window event announcing a chunk-load failure. Detail: { message: string }. */
export const CHUNK_LOAD_ERROR_EVENT = "matrx:chunk-load-error";

/** Window flag set by NewVersionWatcher once React has booted. The boot
 *  script checks it to decide reload (pre-boot) vs event (post-boot). */
export const APP_BOOTED_FLAG = "__MATRX_APP_BOOTED__";

/**
 * THE one pattern set for explicit chunk/module-fetch failures. Every detector
 * in the app tests against this list. These signatures identify what failed;
 * they do not assert why it failed.
 *
 * Do not add generic runtime-integrity messages such as Turbopack's "module
 * factory is not available" here. They can happen on a fresh document load and
 * provide no evidence of a stale deployment. Misclassifying them hides the real
 * exception from the Error Inspector and shows users a false diagnosis.
 */
export const CHUNK_LOAD_ERROR_PATTERNS: RegExp[] = [
  /ChunkLoadError/i,
  /Loading( CSS)? chunk [\w-]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

/** True when `haystack` carries an explicit chunk/module-fetch signature. */
export function hasChunkLoadErrorSignature(haystack: string): boolean {
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "ChunkLoadError") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return hasChunkLoadErrorSignature(msg);
}

/**
 * Announce a chunk-load failure so NewVersionWatcher can offer the user a
 * refresh. Never reloads. Safe to call unconditionally — no-ops unless the
 * error is chunk-shaped.
 */
export function notifyChunkLoadError(error: unknown): void {
  if (typeof window === "undefined") return;
  if (!isChunkLoadError(error)) return;
  const message =
    error instanceof Error ? error.message : String(error ?? "ChunkLoadError");
  window.dispatchEvent(
    new CustomEvent(CHUNK_LOAD_ERROR_EVENT, { detail: { message } }),
  );
}
