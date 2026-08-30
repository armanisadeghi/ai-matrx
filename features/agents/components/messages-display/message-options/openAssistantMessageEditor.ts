/**
 * openAssistantMessageEditor — the ONE way to open the full-screen editor on
 * an assistant message. Used by both the action-bar pencil and the ⋯ menu's
 * "Edit content" so the two paths share a single save contract
 * (`mode: "assistant-message"` → OverlayController dispatches `editMessage`
 * on save; no callback rides Redux).
 *
 * Structured content (`structuredRaw: true` — the message's stored content is
 * a non-text payload such as a media-block array, and `content` is its
 * pretty-printed JSON) opens as a clearly-labeled READ-ONLY raw view instead:
 * no save target, no save button. Saving the JSON string back through
 * `editMessage`/`mergeEditedText` would wrap it in a text block and corrupt
 * the row — an honest read-only raw view beats an empty editable one (the
 * pre-2026-08-30 behavior, where the editor rendered NOTHING for media-array
 * content and the creator could not see what the agent returned).
 *
 * Kept in its own module (not messageActionRegistry) so the action bar can
 * import it without pulling the whole registry into its chunk — the registry
 * is deliberately lazy-loaded behind the ⋯ menu.
 */

import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { AppDispatch } from "@/lib/redux/store";

export interface OpenAssistantMessageEditorArgs {
  content: string;
  conversationId: string | null;
  messageId: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * True when `content` is the pretty-printed JSON of a structured (non-text)
   * stored payload — opens the read-only raw view. See module doc.
   */
  structuredRaw?: boolean;
}

export function openAssistantMessageEditor(
  dispatch: AppDispatch,
  {
    content,
    conversationId,
    messageId,
    metadata,
    structuredRaw,
  }: OpenAssistantMessageEditorArgs,
): void {
  if (structuredRaw) {
    openStructuredRawViewer(dispatch, { content, messageId, metadata });
    return;
  }
  dispatch(
    openOverlay({
      overlayId: "fullScreenEditor",
      instanceId: `assistant-edit-${messageId}`,
      data: {
        content,
        mode: "assistant-message",
        conversationId: conversationId ?? undefined,
        messageId: messageId ?? undefined,
        tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
        initialTab: "matrx_split",
        analysisData: (metadata ?? undefined) as
          | Record<string, unknown>
          | undefined,
        title: undefined,
        showSaveButton: true,
        showCopyButton: true,
      },
    }),
  );
}

export interface OpenStructuredRawViewerArgs {
  /** Pretty-printed JSON of the stored payload (extractInspectableText). */
  content: string;
  messageId: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Read-only raw view of a structured message payload. Shared by the assistant
 * and user edit entry points — a message whose stored content is a media/
 * structured array is INSPECTED here, never text-edited. No conversation/
 * message id and no save button ride the overlay data, so the bridge has no
 * save path — the payload cannot be corrupted from this view.
 */
export function openStructuredRawViewer(
  dispatch: AppDispatch,
  { content, messageId, metadata }: OpenStructuredRawViewerArgs,
): void {
  dispatch(
    openOverlay({
      overlayId: "fullScreenEditor",
      instanceId: `raw-view-${messageId ?? "unknown"}`,
      data: {
        content,
        mode: "free",
        // Deliberately NO conversationId/messageId: the bridge's self-handle
        // save path keys off those ids, and this view must never write back.
        tabs: ["write", "preview"],
        initialTab: "write",
        analysisData: (metadata ?? undefined) as
          | Record<string, unknown>
          | undefined,
        title: "Structured content (read-only raw)",
        description:
          "This message's stored content is structured data (media blocks or other non-text payload), shown here exactly as stored. It cannot be edited as text — copy it to inspect or reuse.",
        showSaveButton: false,
        showCopyButton: true,
      },
    }),
  );
}
