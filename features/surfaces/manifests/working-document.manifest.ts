/**
 * Surface manifest — Working document (`matrx-user/working-document`).
 *
 * The per-conversation collaborative document the user and the cloud agent build
 * together (the cloud agent reads AND writes it via ctx_patch). When the user
 * steps INSIDE the document — highlights text, right-clicks — this surface's
 * agents act on its parts (selection / body / heading), with the conversation
 * available as a reference. Shares its value set with the scratchpad surface
 * (see `_conversation-document.manifest.ts`) but binds its own agents.
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

export const workingDocumentManifest: SurfaceManifest = {
  surfaceName: "matrx-user/working-document",
  readiness: "verified",
  label: "Working Document",
  intro: `<surface_intro>
You are INSIDE the conversation's working document — the collaborative markdown artifact the user and the cloud agent build together. Here it is just text: its PARTS are your context.
Act on active_text (the highlighted selection when there is one, otherwise the whole body); active_scope_kind tells you which. current_heading / current_section_text bound a section for section-scoped edits, and cursor_offset locates the caret for insert-at-cursor actions.
document_state tells you whether it is safe to write: has_conflict true means a concurrent edit is unresolved and auto-save is blocked — do not write the document; is_dirty means the editor holds unsaved edits; document_version is the optimistic-concurrency token for a direct row write, and is_materialized false means the durable row does not exist yet.
The conversation is a REFERENCE, not your content: conversation_id links back to the chat, and conversation_context / active_scope_ids expose what the chat agent sees when the host supplied them.
</surface_intro>`,
  groups: CONVERSATION_DOCUMENT_GROUPS,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    CONVERSATION_DOCUMENT_VALUES,
  ),
};

/** Type-safe scope helper. Delegates to the shared conversation-document helper. */
export const createWorkingDocumentScope = createConversationDocumentScope;
