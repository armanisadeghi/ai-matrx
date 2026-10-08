/**
 * This app's rich-document registrations into @ai-matrx/rich-content's engine: the action
 * handlers (they register on import), the source adapters for this app's records, and the
 * conversation transfer rows of the Conversation submenu. Loaded by app-bindings, and in Jest on
 * the engine's first registry read (`ensureRichDocumentRegistrations`).
 */
import { registerSourceAdapter } from "@ai-matrx/rich-content/rich-document/actions/sources/index";
import {
  CONVERSATION_SUBMENU_LABEL,
  extendMenuSection,
} from "@ai-matrx/rich-content/rich-document/variants/shared/menuStructure";
import { CONVERSATION_TRANSFER_ROWS } from "@ai-matrx/chat/agents/conversation-export/conversation-transfer-rows";
// The chat-message adapter is chat's own; it registers on import.
import "@ai-matrx/chat/agents/components/messages-display/rich-document/chat-message-source";
import { noteAdapter } from "@/features/rich-document/actions/sources/note";
import { promptResultAdapter } from "@/features/rich-document/actions/sources/prompt-result";
import { artifactAdapter } from "@/features/rich-document/actions/sources/artifact";
import { scraperResultAdapter } from "@/features/rich-document/actions/sources/scraper-result";
import { workingDocumentAdapter } from "@/features/rich-document/actions/sources/working-document";
import "@/features/rich-document/actions/handlers";

// The handlers register on import; the conversation rows join the Conversation submenu (placements
// rebuild on extension, so order does not matter).
extendMenuSection(CONVERSATION_SUBMENU_LABEL, CONVERSATION_TRANSFER_ROWS.map((row) => row.id));

registerSourceAdapter("note", noteAdapter);
registerSourceAdapter("prompt-result", promptResultAdapter);
registerSourceAdapter("artifact", artifactAdapter);
registerSourceAdapter("scraper-result", scraperResultAdapter);
registerSourceAdapter("working-document", workingDocumentAdapter);

