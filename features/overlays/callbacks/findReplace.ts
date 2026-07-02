/**
 * FindReplace overlay callbacks.
 *
 * The `findReplace` overlay carries two things that CANNOT travel through
 * Redux: a live DOM target (the textarea/input being searched) and an
 * `onReplace` handler. Both go through the global `callbackManager` instead,
 * mirroring the ImageUploaderWindow callback contract:
 *
 *   1. Caller creates a callback GROUP via `createFindReplaceCallbackGroup`,
 *      handing over a `getTargetElement` accessor and an optional `onReplace`.
 *   2. The returned `callbackGroupId` is the only thing passed through
 *      `openOverlay` data.
 *   3. The overlay resolves the group by id and reads the live target + handler
 *      back out via `getFindReplaceCallbackGroup`.
 *   4. Caller `dispose()`s the group when it no longer needs it (e.g. on close).
 *
 * Why an accessor rather than the element itself: the live node can mount,
 * unmount, or be replaced while the overlay is open — `getTargetElement()` is
 * re-read at use time so the overlay always targets the current node.
 *
 * The group object is stored directly in a `callbackManager` slot (the same
 * "store an object, retrieve via `get`, never `trigger` it" convention used by
 * `registerWidgetHandle`). The slot id IS the `callbackGroupId`.
 */

import { callbackManager } from "@/utils/callbackManager";

// ─── Group payload (the live, non-serializable handle) ───────────────────────

export interface FindReplaceCallbackGroup {
  /** Re-read at use time so the overlay always targets the live node. */
  getTargetElement: () => HTMLTextAreaElement | HTMLInputElement | null;
  /** Optional. When present, replaces drive content through the caller. */
  onReplace?: (newText: string) => void;
}

// ─── Group creation / disposal ───────────────────────────────────────────────

export function createFindReplaceCallbackGroup(
  group: FindReplaceCallbackGroup,
): { callbackGroupId: string; dispose: () => void } {
  // MATRX-EXCEPTION: `callbackManager.register` slots are declared as
  // `Callback<T>` (a function), but this group object is intentionally
  // stored as a non-callable payload — retrieved via `get`, never
  // `trigger`ed (same convention as `registerWidgetHandle` in
  // utils/callbackManager.ts). No function value exists to pass honestly.
  const callbackGroupId = callbackManager.register(
    group as unknown as () => void,
  );

  return {
    callbackGroupId,
    dispose: () => callbackManager.unregister(callbackGroupId),
  };
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export function getFindReplaceCallbackGroup(
  callbackGroupId: string | null | undefined,
): FindReplaceCallbackGroup | null {
  if (!callbackGroupId) return null;
  return callbackManager.get<FindReplaceCallbackGroup>(callbackGroupId) ?? null;
}
