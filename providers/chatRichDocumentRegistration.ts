// providers/chatRichDocumentRegistration.ts
//
// The app's rich-document action registry, dialogs host and record annotations, registered into
// `@ai-matrx/chat` (../aidream/apps/shared/chat/src/host/rich-document-slots.ts, chat-package-move P14). The
// package draws every action under a chat message through these slots and never imports the
// registry. Imported for its side effect by ChatHostAdapter.

import { lazy } from "react";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import "@ai-matrx/chat/host/rich-document-slots";
import { RichDocumentActions } from "@ai-matrx/rich-content/rich-document/RichDocumentActions";
import { RegistryContextMenu } from "@ai-matrx/rich-content/rich-document/RegistryContextMenu";
import { RichDocumentActionProvider } from "@ai-matrx/rich-content/rich-document/RichDocumentActionProvider";
import { RichDocumentActionSurface } from "@ai-matrx/rich-content/rich-document/RichDocumentActionSurface";
import { buildChatMessageActions } from "@/features/rich-document/chat/chatMessageActions";
import { convertOriginForSource, useDocumentDialogsHost } from "@/features/rich-document/hosts/DocumentDialogsHost";
import { RecordAnnotations } from "@/features/rich-document/annotations/RecordAnnotations";
import { annotationRecordOf } from "@/features/rich-document/annotations/record-of-source";
import { bindConversationToApplyTarget } from "@ai-matrx/rich-content/rich-document/review/applyTargets";

// The ⋯ menu stays a lazy chunk: loaded only when a person opens it.
const RegistryActionMenu = lazy(() =>
  import("@ai-matrx/rich-content/rich-document/variants/RegistryActionMenu").then((m) => ({ default: m.RegistryActionMenu })),
);

export const chatRichDocumentSlots = {
  RichDocumentActions,
  RegistryContextMenu,
  RegistryActionMenu,
  RichDocumentActionProvider,
  RichDocumentActionSurface,
  RecordAnnotations,
  buildChatMessageActions,
  convertOriginForSource,
  useDocumentDialogsHost,
  annotationRecordOf,
  bindConversationToApplyTarget,
};

registerChatUi(chatRichDocumentSlots);
