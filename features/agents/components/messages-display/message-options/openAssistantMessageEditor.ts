/**
 * openAssistantMessageEditor — the ONE way to open the full-screen editor on
 * an assistant message. Used by both the action-bar pencil and the ⋯ menu's
 * "Edit content" so the two paths share a single save contract
 * (`mode: "assistant-message"` → OverlayController dispatches `editMessage`
 * on save; no callback rides Redux).
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
}

export function openAssistantMessageEditor(
  dispatch: AppDispatch,
  { content, conversationId, messageId, metadata }: OpenAssistantMessageEditorArgs,
): void {
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
