/**
 * Surface manifest — Scratchpad (`matrx-user/scratchpad`).
 *
 * The user's private per-conversation notes. Outside, in chat, the cloud agent
 * only READS the scratchpad and never edits it — that is its purpose as a
 * context item. But once the user steps INSIDE the scratchpad it is just text:
 * a local context-menu agent here CAN see and edit it (clean it up, bullet it,
 * make a table). That is why it is its own surface with its own bound agents,
 * distinct from `matrx-user/working-document` even though the value set is
 * identical (see `_conversation-document.manifest.ts`).
 *
 * Emitted at trigger time by `useWorkingDocumentSurfaceScope`; wired into the
 * editor's `UnifiedAgentContextMenu` in `WorkingDocumentEditor`.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import {
  CONVERSATION_DOCUMENT_GROUPS,
  CONVERSATION_DOCUMENT_VALUES,
  createConversationDocumentScope,
} from "./_conversation-document.manifest";

export const scratchpadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/scratchpad",
  readiness: "verified",
  label: "Scratchpad",
  intro: `<surface_intro>
You are INSIDE the user's scratchpad — their private per-conversation notes. In chat the cloud agent only READS this; but here, acting on the user's own request, it is just text and you may rewrite, bullet, tabulate, or clean it up.
Act on active_text (the highlighted selection when there is one, otherwise the whole body); active_scope_kind tells you which. current_heading / current_section_text bound a section, and cursor_offset locates the caret for insert-at-cursor actions.
document_state tells you whether it is safe to write: has_conflict true means a concurrent edit is unresolved and auto-save is blocked; is_dirty means unsaved local edits; document_version is the concurrency token for a direct row write.
The conversation is a REFERENCE, not your content: conversation_id links back to the chat, and conversation_context / active_scope_ids expose what the chat agent sees when the host supplied them.
</surface_intro>`,
  groups: CONVERSATION_DOCUMENT_GROUPS,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    CONVERSATION_DOCUMENT_VALUES,
  ),
};

/** Type-safe scope helper. Delegates to the shared conversation-document helper. */
export const createScratchpadScope = createConversationDocumentScope;
