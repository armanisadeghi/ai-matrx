// features/rich-document/actions/sources/index.ts
//
// Static map from ContentSourceType → ContentSourceAdapter. Used by the
// RichDocument runtime to resolve which adapter handles a given source.
//
// Adapters carry the bridge from generic action handlers (copy, save-to-task,
// etc.) to source-specific operations (editMessage thunk vs NotesAPI.update).
// Phase 0 ships with instanceKey support only; edit/delete/re-run land in
// Phase 1 alongside the handler migration.

import type {
  ContentSourceAdapter,
  ContentSourceType,
} from "../../types";
import { chatMessageAdapter } from "./chat-message";
import { noteAdapter } from "./note";
import { promptResultAdapter } from "./prompt-result";
import { artifactAdapter } from "./artifact";
import { scraperResultAdapter } from "./scraper-result";
import { workingDocumentAdapter } from "./working-document";
import { rawAdapter } from "./raw";

export const SOURCE_ADAPTERS: Record<
  ContentSourceType,
  ContentSourceAdapter
> = {
  "chat-message": chatMessageAdapter,
  note: noteAdapter,
  "prompt-result": promptResultAdapter,
  artifact: artifactAdapter,
  "scraper-result": scraperResultAdapter,
  "working-document": workingDocumentAdapter,
  raw: rawAdapter,
};

export function getSourceAdapter(
  sourceType: ContentSourceType,
): ContentSourceAdapter {
  const adapter = SOURCE_ADAPTERS[sourceType];
  if (!adapter) {
    throw new Error(`No source adapter registered for type: ${sourceType}`);
  }
  return adapter;
}
