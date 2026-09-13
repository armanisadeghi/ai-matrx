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
  /**
   * Which footer action the user chose. `undefined` for the plain single-Save
   * editor; set to the action id (e.g. "save" / "resubmit" / "fork") when the
   * editor was opened with `primaryActions`. Lets one editor offer several
   * outcomes without a follow-up confirmation dialog.
   */
  action?: string;
}

export type FullScreenEditorEvent = FullScreenEditorSaveEvent;

// ─── Caller-facing handler surface ───────────────────────────────────────────

type AsyncSaveHandler = (content: string) => Promise<void>;
type AsyncActionHandler = (action: string, content: string) => Promise<void>;

type FullScreenEditorCommandHandler =
  | { onSave: AsyncSaveHandler; onAction?: never }
  | { onSave?: never; onAction: AsyncActionHandler };

const retainedSaveGroups = new Set<string>();

export type FullScreenEditorHandlers = FullScreenEditorCommandHandler & {
  /** Called when the user saves. Receives the edited content. */
  /**
   * Called when the user clicks one of the editor's `primaryActions`. Receives
   * the chosen action id and the edited content. Preferred over `onSave` for
   * multi-outcome editors (Save vs. Save & Resubmit vs. Create Fork).
   */
  /** Catch-all for any emitted event. */
  onEvent?: (event: FullScreenEditorEvent) => void | Promise<void>;
  /** The owner remains open and needs later saves to use its acknowledged base. */
  retainAfterSuccess?: boolean;
};

// ─── Group creation / disposal ───────────────────────────────────────────────

export function createFullScreenEditorCallbackGroup(
  handlers: FullScreenEditorHandlers,
): { callbackGroupId: string; dispose: () => void } {
  if ((handlers.onSave ? 1 : 0) + (handlers.onAction ? 1 : 0) !== 1) {
    throw new Error("A full-screen editor callback group requires exactly one save owner");
  }
  const callbackGroupId = callbackManager.createGroup();
  if (handlers.retainAfterSuccess) retainedSaveGroups.add(callbackGroupId);

  const requireThenable = (value: unknown): Promise<void> => {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function") ||
      !("then" in value) ||
      typeof value.then !== "function"
    ) {
      throw new Error("A full-screen editor save owner must return a Promise");
    }
    return Promise.resolve(value).then(() => undefined);
  };

  const fanOut = (event: FullScreenEditorEvent): Promise<void> => {
    let command: Promise<void>;
    if (event.type === "save") {
      if (handlers.onSave) {
        command = requireThenable(handlers.onSave(event.content));
      } else if (handlers.onAction) {
        command = requireThenable(handlers.onAction(event.action ?? "save", event.content));
      } else {
        return Promise.reject(new Error("A full-screen editor save owner is missing"));
      }
    }
    return command!.then(async () => {
      if (!handlers.onEvent) return;
      try {
        await handlers.onEvent(event);
      } catch (error) {
        console.error("[fullScreenEditor] save observer failed", error);
      }
    });
  };

  callbackManager.registerWithContext<FullScreenEditorEvent>(
    fanOut,
    { groupId: callbackGroupId },
  );

  return {
    callbackGroupId,
    dispose: () => disposeFullScreenEditorCallbackGroup(callbackGroupId),
  };
}

/** One terminal cleanup primitive for bridges and imperative opener handles. */
export function disposeFullScreenEditorCallbackGroup(callbackGroupId: string | null | undefined): void {
  if (callbackGroupId) {
    retainedSaveGroups.delete(callbackGroupId);
    callbackManager.removeGroup(callbackGroupId);
  }
}

/**
 * Emit a save from the editor side. No-op when there is no group (the caller
 * opted into the bridge's self-handle path instead).
 *
 * `removeAfterTrigger: true` — the editor bridge closes itself immediately
 * after a save, so a group fires at most once. Tearing it down on emit means
 * the happy path leaves nothing behind; the opener's unmount-dispose only has
 * to clean up the cancel-without-save case (bounded, freed on owner unmount).
 */
export function emitFullScreenEditorSave(
  callbackGroupId: string | undefined | null,
  content: string,
  action?: string,
): Promise<void> {
  if (!callbackGroupId) {
    return Promise.reject(new Error("This editor no longer has a save target"));
  }
  return callbackManager.triggerGroupCommand<FullScreenEditorEvent>(
    callbackGroupId,
    { type: "save", content, action },
    { removeAfterSuccess: !retainedSaveGroups.has(callbackGroupId) },
  );
}
