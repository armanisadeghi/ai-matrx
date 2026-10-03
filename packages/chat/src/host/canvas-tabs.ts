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
/**
 * Everything a conversation's next turn carries, with full control (the
 * composer's value chip opens it): ONE tab per conversation, keyed by its id.
 * The tab's `selected` field is the value it shows.
 */
export const CONVERSATION_CONTEXT_KIND = "conversation-context";

/** A conversation's agent lists (plan, agent tasks, the person's todos): ONE tab per conversation. */
export const CONVERSATION_LISTS_KIND = "conversation-lists";

/** An agent's unsaved edits as a diff against its saved version: ONE tab per agent. */
export const AGENT_UNSAVED_CHANGES_KIND = "agent-unsaved-changes";

/**
 * The attachments one chip host shows (a sent message's strip, the composer's
 * resources, a conversation's attached documents): ONE tab per host, keyed by
 * it. `items` is the host's list, `selected` the one on screen; the tab pages
 * through the list in place.
 */
export const CONTEXT_ITEMS_KIND = "context-items";

/**
 * One context value a sent message carried, in full (key, type, policy, the
 * frozen value): ONE tab per conversation, keyed by its id. `selected` names
 * the value on screen (its key plus a hash of the snapshot).
 */
export const CONTEXT_VALUE_KIND = "context-value";

/** A conversation's working-document version history: ONE tab per conversation. */
export const WORKING_DOCUMENT_HISTORY_KIND = "working-document-history";

/**
 * What a SENT turn actually delivered (the server's context receipt), with
 * every value's delivered text one click in: ONE tab per message, keyed by
 * the message id.
 */
export const MESSAGE_CONTEXT_RECEIPT_KIND = "message-context-receipt";

/** Every tab kind the package opens by name through `canvas.useTab`. */
export type ChatCanvasTabKind =
  | typeof CONVERSATION_CONTEXT_KIND
  | typeof CONVERSATION_LISTS_KIND
  | typeof AGENT_UNSAVED_CHANGES_KIND
  | typeof CONTEXT_ITEMS_KIND
  | typeof MESSAGE_CONTEXT_RECEIPT_KIND
  | typeof CONTEXT_VALUE_KIND
  | typeof WORKING_DOCUMENT_HISTORY_KIND;
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

/** The canvas tab id of a conversation's context tab. */
export function conversationContextTabId(conversationId: string): string {
  return canvasItemId(CONVERSATION_CONTEXT_KIND, conversationId);
}

/** The canvas tab id of a conversation's agent lists tab. */
export function conversationListsTabId(conversationId: string): string {
  return canvasItemId(CONVERSATION_LISTS_KIND, conversationId);
}
