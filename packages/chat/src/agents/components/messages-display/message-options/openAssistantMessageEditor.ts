/**
 * openStructuredRawViewer — the read-only raw view of a message whose stored
 * content is a structured (non-text) payload.
 *
 * The assistant TEXT editor that used to live here (`openAssistantMessageEditor`,
 * `mode: "assistant-message"` → the old full-screen editor's `editMessage`
 * self-handle) is gone (RC-B5): it opened on display text and its save dropped
 * inline reasoning and rewrote blank-line runs. A chat answer is edited only by
 * THE ONE editor, in place (`InPlaceAnswerEditor`, splice-safe save).
 */

import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { AppDispatch } from "@/lib/redux/store";

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
