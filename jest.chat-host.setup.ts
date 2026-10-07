/**
 * Jest only: the app's chat-host slots for suites that run real `@ai-matrx/chat` code which
 * reaches the host's kind registry, block classifier or rich-document registry
 * (../aidream/apps/shared/chat/src/host/content-ir-slots.ts, rich-document-slots.ts).
 *
 * Each slot is registered as a thin wrapper that loads the REAL registration
 * (providers/chatContentIrRegistration, providers/chatRichDocumentRegistration) on its first
 * call — after the suite's own `jest.mock` calls — so a suite that never touches these slots
 * loads nothing, and a suite that does sees the real host, never a stub. A suite that
 * registers its own slot afterwards simply overrides it.
 */
import { createElement } from "react";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";

type Slots = Record<string, unknown>;
const loaders: Record<"content-ir" | "rich-document", () => Slots> = {
  "content-ir": () => require("@/providers/chatContentIrRegistration").chatContentIrSlots,
  "rich-document": () => require("@/providers/chatRichDocumentRegistration").chatRichDocumentSlots,
};

const FUNCTIONS: Record<string, string[]> = {
  "content-ir": [
    "seedEnvelope",
    "seedPersistedEnvelopeCache",
    "withIrEnvelope",
    "sessionEnvelope",
    "envelopeForCompletedFenceRegion",
    "envelopeForCompletedXmlRegion",
    "contentIrKindRegistry",
    "contentIrComponentRegistry",
    "contentIrKindValidator",
    "progressDataRenderBlock",
    "contentSplitterPrimitives",
    "useAnchorRecords",
    "fetchShapePage",
    "fetchShapeByKind",
  ],
  "rich-document": [
    "buildChatMessageActions",
    "convertOriginForSource",
    "useDocumentDialogsHost",
    "annotationRecordOf",
    "bindConversationToApplyTarget",
  ],
};
const COMPONENTS: Record<string, string[]> = {
  "content-ir": ["KindInstanceRender", "AnchorRecordsList"],
  "rich-document": [
    "RichDocumentActions",
    "RegistryContextMenu",
    "RegistryActionMenu",
    "RichDocumentActionProvider",
    "RichDocumentActionSurface",
    "RecordAnnotations",
  ],
};

const lazy: Slots = {};
for (const group of Object.keys(loaders) as Array<keyof typeof loaders>) {
  for (const name of FUNCTIONS[group]) {
    lazy[name] = (...args: unknown[]) => (loaders[group]()[name] as (...a: unknown[]) => unknown)(...args);
  }
  for (const name of COMPONENTS[group]) {
    const Lazy = (props: object) => createElement(loaders[group]()[name] as never, props);
    Lazy.displayName = `LazyChatHost(${name})`;
    lazy[name] = Lazy;
  }
}
registerChatUi(lazy as never);
