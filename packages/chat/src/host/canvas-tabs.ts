/**
 * The canvas tabs the package opens by NAME — one identity per thing.
 *
 * A conversation's documents are ONE tab, `conversation-documents` keyed by
 * the conversation id (the host registers its body, the DocumentsWorkspace);
 * the person's scratchpad is ONE tab, `global-scratchpad` keyed "default"
 * (the host's ScratchpadQuickPanel on the active scratchpad). The package
 * opens them through the windows port (`openWorkingDocumentPanel`,
 * `openScratchpadPanel`) and recognises them on the canvas by these ids, so
 * every door — the header Canvas button, the composer rail, a tool's result
 * bar, the editor's "Open in Canvas" — lands on the same tab.
 *
 * Until 2026-10-02 the same documents also opened as the artifact content
 * types `working_document` / `scratchpad` keyed `wd:<scope>:<kind>`: two tabs
 * for one thing, each with its own body.
 */

import { canvasItemId } from "@ai-matrx/canvas";

export const CONVERSATION_DOCUMENTS_KIND = "conversation-documents";
export const SCRATCHPAD_KIND = "global-scratchpad";
/** The scratchpad tab follows the ACTIVE scratchpad, so there is exactly one. */
export const SCRATCHPAD_TAB_KEY = "default";

/** The canvas tab id of a conversation's Documents tab. */
export function conversationDocumentsTabId(conversationId: string): string {
  return canvasItemId(CONVERSATION_DOCUMENTS_KIND, conversationId);
}

/** The canvas tab id of the scratchpad tab. */
export function scratchpadTabId(): string {
  return canvasItemId(SCRATCHPAD_KIND, SCRATCHPAD_TAB_KEY);
}
