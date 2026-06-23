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
  CONVERSATION_DOCUMENT_VALUES,
  createConversationDocumentScope,
} from "./_conversation-document.manifest";

export const workingDocumentManifest: SurfaceManifest = {
  surfaceName: "matrx-user/working-document",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    CONVERSATION_DOCUMENT_VALUES,
  ),
};

/** Type-safe scope helper. Delegates to the shared conversation-document helper. */
export const createWorkingDocumentScope = createConversationDocumentScope;
