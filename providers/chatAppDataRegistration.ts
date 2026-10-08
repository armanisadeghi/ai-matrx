// providers/chatAppDataRegistration.ts
//
// The app's DATA around a rendered chat message, registered into `@ai-matrx/chat`
// (../aidream/apps/shared/chat/src/host/app-data-slots.ts, P29a): the live kind validator, the
// records anchored to a chat, the shape catalog, the Source Inspector a citation opens and the
// full-screen editor. The formatted-text engine itself is NOT registered here — chat imports
// @ai-matrx/rich-content directly, and the app configures that package once (richContentHost).
// Imported for its side effect by ChatHostAdapter.

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import "@ai-matrx/chat/host/app-data-slots";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import { AnchorRecordsList, useAnchorRecords } from "@/features/content-ir/records/AnchorRecordsList";
import { fetchShapeByKind, fetchShapePage } from "@/features/content-ir/browse/service";
import { useOpenCitationSource } from "@/components/mardown-display/chat-markdown/citations/useOpenCitationSource";
import FullScreenMarkdownEditor from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor";

export const chatAppDataSlots = {
  contentIrKindValidator: () => kindValidator,
  AnchorRecordsList,
  useAnchorRecords,
  fetchShapePage,
  fetchShapeByKind,
  useOpenCitationSource,
  FullScreenMarkdownEditor,
};

registerChatUi(chatAppDataSlots);
