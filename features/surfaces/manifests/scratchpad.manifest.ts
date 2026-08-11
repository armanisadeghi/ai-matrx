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
 * editor's `UnifiedAgentContextMenu` in `WorkingDocumentEditor`, which also
 * mounts this surface's `SurfaceRuntimeProvider` (scope + write handlers).
 *
 * WRITE TARGETS — why the SAME four as `matrx-user/working-document`:
 * The docblock above is the whole reason to ask the question: out in the chat
 * the cloud agent only READS the scratchpad. That restriction is enforced where
 * it belongs — the scratchpad is published to a conversation as a READ-ONLY
 * context entry (`user_scratchpad`), and nothing in the chat's `ctx_patch` path
 * can write it. It is a statement about the OUTSIDE agent, not about this text.
 *
 * These targets are offered ONLY to an agent the user runs from inside the
 * scratchpad, on their own explicit request, behind a per-target confirm — the
 * exact case this manifest was split off to serve ("clean it up, bullet it, make
 * a table"). Nothing here weakens the outside rule, and the private-notes
 * framing does not make the writable parts of the text any different from the
 * working document's: same editor, same body, same selection, same conflict
 * rule. So the same shared target set applies verbatim, and pinning both
 * surfaces to `CONVERSATION_DOCUMENT_WRITE_TARGETS` is what stops the two from
 * drifting apart while one editor and one handler block serve both.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import {
  CONVERSATION_DOCUMENT_GROUPS,
  CONVERSATION_DOCUMENT_VALUES,
  CONVERSATION_DOCUMENT_WRITE_TARGETS,
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
  writeTargets: CONVERSATION_DOCUMENT_WRITE_TARGETS,
};

/** Type-safe scope helper. Delegates to the shared conversation-document helper. */
export const createScratchpadScope = createConversationDocumentScope;
