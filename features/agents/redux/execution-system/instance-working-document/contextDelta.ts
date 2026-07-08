/**
 * Pure applier for `context_delta` stream events (D9 fix).
 *
 * The backend emits one `context_delta` per agent ctx_patch/create the moment
 * the edit lands in memory — BEFORE the fire-and-forget DB writeback — so the
 * client can reflect the edit live instead of re-reading the row after the
 * turn. Two wire forms (see aidream `ContextDeltaData`):
 *   - `splice`: replace `[start, end)` of the pre-edit content with `text`,
 *     guarded by `base_len` (pre-edit length) and `new_len` (post-edit length);
 *   - `full`: `content` is the complete post-edit content.
 *
 * Kept dependency-free so it is unit-testable and reusable by any surface that
 * consumes the event (conversation working doc, Scribe studio document).
 */

import type { ContextDeltaData } from "@/types/python-generated/stream-events";

/**
 * Apply a `context_delta` payload to the current content. Returns the new
 * content, or `null` when the delta cannot be applied safely:
 *   - a splice whose `base_len` doesn't match the local copy's length (the
 *     local copy diverged — e.g. the user typed mid-turn);
 *   - out-of-range splice bounds or a post-splice length that misses
 *     `new_len`;
 *   - a malformed/incomplete payload.
 * `null` is NOT an error path — the `context_persisted` re-read remains the
 * canonical backstop and heals any skipped delta.
 */
export function applyContextDeltaToContent(
  current: string,
  delta: ContextDeltaData,
): string | null {
  if (delta.delta_kind === "splice") {
    const { start, end, text, base_len, new_len } = delta;
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      typeof text !== "string" ||
      typeof base_len !== "number"
    ) {
      return null;
    }
    if (current.length !== base_len) return null; // local copy diverged
    if (start < 0 || end < start || end > current.length) return null;
    const next = current.slice(0, start) + text + current.slice(end);
    if (typeof new_len === "number" && next.length !== new_len) return null;
    return next;
  }
  return typeof delta.content === "string" ? delta.content : null;
}
