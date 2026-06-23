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
  CONVERSATION_DOCUMENT_VALUES,
  createConversationDocumentScope,
} from "./_conversation-document.manifest";

export const scratchpadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/scratchpad",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    CONVERSATION_DOCUMENT_VALUES,
  ),
};

/** Type-safe scope helper. Delegates to the shared conversation-document helper. */
export const createScratchpadScope = createConversationDocumentScope;
