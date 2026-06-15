/**
 * fullScreenEditor callbacks.
 *
 * The full-screen markdown editor (`FullScreenMarkdownEditorBridge`) talks
 * back to whoever opened it via the global `callbackManager`, exactly like
 * the image-uploader / content-editor windows. Functions NEVER travel through
 * Redux — the opener registers a callback GROUP, the serialisable
 * `callbackGroupId` string is passed through `openOverlay` data, and the
 * editor emits a typed save event on that group.
 *
 * This is the missing primitive that made "Edit", "Edit & resubmit", and the
 * overflow-menu "Edit content" silently no-op: the OverlayController correctly
 * refused to pass an `onSave` function through Redux and hard-coded
 * `onSave={undefined}`, but no callback-group channel existed to replace it.
 *
 * Contract:
 *   1. Caller creates a group via `createFullScreenEditorCallbackGroup({ onSave })`.
 *   2. The returned `callbackGroupId` is passed through `openOverlay` data.
 *   3. The bridge subscribes to that group and emits a `save` event when the
 *      user saves; `onSave(newContent)` fires in the caller's context.
 *   4. Caller `dispose()`s the group on close (the opener handles this).
 *
 * The bridge can ALSO self-handle a save (calling `editMessage` directly) when
 * it was given a `conversationId` + `messageId` and NO callback group. The
 * callback group, when present, always wins — the caller owns the outcome
 * (e.g. opening the fork-vs-overwrite dialog for "Edit & resubmit").
 */

import { callbackManager } from "@/utils/callbackManager";

// ─── Event surface ───────────────────────────────────────────────────────────

export interface FullScreenEditorSaveEvent {
  type: "save";
  /** The edited plain-text content the user saved. */
  content: string;
}

export type FullScreenEditorEvent = FullScreenEditorSaveEvent;

// ─── Caller-facing handler surface ───────────────────────────────────────────

export interface FullScreenEditorHandlers {
  /** Called when the user saves. Receives the edited content. */
  onSave?: (content: string) => void;
  /** Catch-all for any emitted event. */
  onEvent?: (event: FullScreenEditorEvent) => void;
}

// ─── Group creation / disposal ───────────────────────────────────────────────

export function createFullScreenEditorCallbackGroup(
  handlers: FullScreenEditorHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();

  const fanOut = (event: FullScreenEditorEvent) => {
    if (event.type === "save") handlers.onSave?.(event.content);
    handlers.onEvent?.(event);
  };

  callbackManager.registerWithContext<FullScreenEditorEvent>(
    (event) => fanOut(event),
    { groupId: callbackGroupId },
  );

  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

/**
 * Emit a save from the editor side. No-op when there is no group (the caller
 * opted into the bridge's self-handle path instead). `removeAfterTrigger` is
 * false so the same editor instance can save more than once before close.
 */
export function emitFullScreenEditorSave(
  callbackGroupId: string | undefined | null,
  content: string,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<FullScreenEditorEvent>(
    callbackGroupId,
    { type: "save", content },
    { removeAfterTrigger: false },
  );
}
