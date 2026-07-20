"use client";

/**
 * FullScreenMarkdownEditorBridge — registry adapter for `FullScreenMarkdownEditor`.
 *
 * `UnifiedOverlayController` -> `OverlaySurface` spreads the overlay's `data`
 * payload onto the registered component as props. Our overlay data shape
 * (defined by `openFullScreenEditor` in `lib/redux/slices/overlaySlice.ts`)
 * uses keys `content` and the surface injects `onClose` — but
 * `FullScreenMarkdownEditor` exposes its props as `initialContent` and
 * `onCancel`. Without an adapter, the editor mounted with `initialContent`
 * undefined (renders empty) and `onCancel` undefined (Esc/Cancel were no-ops,
 * which felt like a hard freeze).
 *
 * This bridge mirrors the legacy glue code that used to live inline in
 * `components/overlays/OverlayController.tsx` (deleted 2026-05-06 — only
 * `UnifiedOverlayController` is mounted in `app/DeferredSingletons.tsx` and
 * `app/(public)/PublicProviders.tsx`). It:
 *
 *   1. maps `content` → `initialContent` and `onClose` → `onCancel`
 *   2. wires `onChange` to mirror every keystroke into `overlayDataSlice` so
 *      content survives close/reopen for the same `instanceId`
 *   3. dispatches the right save thunk based on `mode`:
 *        - "assistant-message" → `editMessage` against `cx_message`
 *        - "free" / undefined  → falls back to a legacy `onSave` callback if
 *          the caller provided one (kept for unmigrated call sites)
 *
 * Use this bridge as the registry's `componentImport` target — never import
 * `FullScreenMarkdownEditor` directly from `windowRegistry.ts`.
 */

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  closeOverlay,
  type FullScreenEditorMode,
} from "@/lib/redux/slices/overlaySlice";
import { updateOverlayData } from "@/lib/redux/slices/overlayDataSlice";
import { emitFullScreenEditorSave } from "@/features/overlays/callbacks/fullScreenEditor";
import { mergeEditedText } from "@/features/agents/redux/execution-system/message-crud/content-blocks.util";
import type { EditorPrimaryAction } from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor";

const FullScreenMarkdownEditor = dynamic(
  () =>
    import("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor"),
  { ssr: false },
);

type TabId = "write" | "matrx_split" | "markdown" | "wysiwyg" | "preview";

interface FullScreenMarkdownEditorBridgeProps {
  isOpen: boolean;
  instanceId?: string;
  onClose: () => void;
  // Data payload spread from overlay state by OverlaySurface:
  content?: string;
  mode?: FullScreenEditorMode;
  conversationId?: string;
  messageId?: string;
  /**
   * Callback-group id (from `callbackManager`) the caller registered to be
   * told about the save. When present it ALWAYS wins over the self-handle
   * path — the caller owns the outcome (persist, or open the fork-vs-overwrite
   * dialog for "Edit & resubmit"). Functions never travel through Redux; this
   * string is the channel back. See features/overlays/callbacks/fullScreenEditor.ts.
   */
  callbackGroupId?: string | null;
  /**
   * In-process callback path. Only reachable when the bridge is rendered
   * directly (not via the overlay controller, which can't serialise a fn).
   * Retained for any direct mount; the overlay path uses `callbackGroupId`.
   */
  onSave?: (newContent: string) => void;
  tabs?: TabId[];
  initialTab?: TabId;
  analysisData?: Record<string, unknown>;
  title?: string;
  description?: string;
  showSaveButton?: boolean;
  showCopyButton?: boolean;
  /**
   * Footer action buttons. When present they replace the single Save button;
   * clicking one emits a save event carrying the chosen `action` id through
   * the callback group, so the opener can run different outcomes (Save vs.
   * Save & Resubmit vs. Create Fork) from one editor with no second dialog.
   */
  primaryActions?: EditorPrimaryAction[];
}

export function FullScreenMarkdownEditorBridge({
  isOpen,
  instanceId = "default",
  onClose,
  content = "",
  mode,
  conversationId,
  messageId,
  callbackGroupId,
  onSave,
  tabs,
  initialTab,
  analysisData,
  title,
  description,
  showSaveButton,
  showCopyButton,
  primaryActions,
}: FullScreenMarkdownEditorBridgeProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const handleChange = useCallback(
    (newContent: string) => {
      dispatch(
        updateOverlayData({
          overlayId: "fullScreenEditor",
          instanceId,
          updates: { content: newContent },
        }),
      );
    },
    [dispatch, instanceId],
  );

  const handleSave = useCallback(
    async (newContent: string) => {
      dispatch(
        updateOverlayData({
          overlayId: "fullScreenEditor",
          instanceId,
          updates: { content: newContent },
        }),
      );

      try {
        // 1. Callback group wins. The caller asked to be told about the save
        //    so it can own the outcome (persist itself, or open the
        //    fork-vs-overwrite dialog for "Edit & resubmit").
        if (callbackGroupId) {
          emitFullScreenEditorSave(callbackGroupId, newContent);
        } else if (conversationId && messageId) {
          // 2. Self-handle: persist directly via editMessage. Works for any
          //    message (user or assistant) — `mode` is no longer the gate.
          //    Preserve the message's non-text blocks (attachments/chips);
          //    the editor only edits text.
          const { editMessage } =
            await import("@/features/agents/redux/execution-system/message-crud/edit-message.thunk");
          const existing =
            store.getState().messages.byConversationId[conversationId]?.byId?.[
              messageId
            ]?.content;
          await dispatch(
            editMessage({
              conversationId,
              messageId,
              newContent: mergeEditedText(existing, newContent),
            }),
          ).unwrap();
          const { toast } = await import("@/lib/toast");
          toast.success("Message saved");
        } else if (typeof onSave === "function") {
          // 3. In-process callback (direct mount only).
          onSave(newContent);
        } else {
          // 4. Loud recovery: the editor was opened with no way to save.
          //    A recovery firing here means a callsite wired the editor
          //    without a save target — surface it, never swallow.
          const { toast } = await import("@/lib/toast");
          console.error(
            "[FullScreenMarkdownEditorBridge] save with no target — " +
              "no callbackGroupId, no conversationId/messageId, no onSave. " +
              `instanceId=${instanceId} mode=${String(mode)}`,
          );
          toast.error("Couldn't save — this editor has no save target");
        }
      } catch (err) {
        const { toast } = await import("@/lib/toast");
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" &&
                err &&
                "message" in err &&
                typeof (err as { message?: unknown }).message === "string"
              ? (err as { message: string }).message
              : "Save failed";
        console.error("[FullScreenMarkdownEditorBridge] save failed", err);
        toast.error(msg);
      }

      dispatch(closeOverlay({ overlayId: "fullScreenEditor", instanceId }));
    },
    [
      dispatch,
      store,
      instanceId,
      mode,
      conversationId,
      messageId,
      callbackGroupId,
      onSave,
    ],
  );

  // Multi-outcome footer actions. Each button emits a save event tagged with
  // its action id so the opener runs the right flow (plain save / resubmit /
  // fork) with no follow-up confirmation dialog. Mirrors the overlay-data
  // content into the store first, exactly like `handleSave`, then closes.
  const handlePrimaryAction = useCallback(
    (actionId: string, newContent: string) => {
      dispatch(
        updateOverlayData({
          overlayId: "fullScreenEditor",
          instanceId,
          updates: { content: newContent },
        }),
      );
      // Actions ALWAYS travel through the callback group. If none was
      // registered the caller wired the editor wrong — surface it loudly
      // rather than silently dropping the click.
      if (callbackGroupId) {
        emitFullScreenEditorSave(callbackGroupId, newContent, actionId);
      } else {
        console.error(
          "[FullScreenMarkdownEditorBridge] primary action fired with no " +
            `callbackGroupId — action="${actionId}" instanceId=${instanceId}`,
        );
      }
      dispatch(closeOverlay({ overlayId: "fullScreenEditor", instanceId }));
    },
    [dispatch, instanceId, callbackGroupId],
  );

  return (
    <FullScreenMarkdownEditor
      isOpen={isOpen}
      initialContent={content}
      onSave={handleSave}
      onChange={handleChange}
      onCancel={onClose}
      tabs={tabs}
      initialTab={initialTab}
      analysisData={analysisData}
      messageId={messageId}
      title={title}
      description={description}
      showSaveButton={showSaveButton}
      showCopyButton={showCopyButton}
      primaryActions={primaryActions}
      onPrimaryAction={handlePrimaryAction}
    />
  );
}

export default FullScreenMarkdownEditorBridge;
