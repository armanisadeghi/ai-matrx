// providers/chatContentIrRegistration.ts
//
// The app's kind / component registries, region-envelope memo, kind correctors, block-classifier
// primitives, kind validator, record lists and shape catalog, registered into `@ai-matrx/chat`
// (../aidream/apps/shared/chat/src/host/content-ir-slots.ts, chat-package-move P14). The package's stream
// accumulator and selectors reach them through these slots and never import them. Imported for
// its side effect by ChatHostAdapter.

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import "@ai-matrx/chat/host/content-ir-slots";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import {
  seedEnvelope,
  seedPersistedEnvelopeCache,
  withIrEnvelope,
} from "@ai-matrx/rich-content/kinds/registry/region-envelope-memo";
import { sessionEnvelope } from "@ai-matrx/rich-content/kinds/registry/kind-correctors";
import {
  envelopeForCompletedFenceRegion,
  envelopeForCompletedXmlRegion,
} from "@/features/content-ir/surfaces/xml-finalize";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import { progressDataRenderBlock } from "@/features/content-ir/redux/progress-data-block";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { AnchorRecordsList, useAnchorRecords } from "@/features/content-ir/records/AnchorRecordsList";
import { fetchShapeByKind, fetchShapePage } from "@/features/content-ir/browse/service";
import * as splitter from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";

const contentSplitterPrimitives = {
  SPECIAL_CODE_LANGUAGES: splitter.SPECIAL_CODE_LANGUAGES,
  detectJsonBlockType: splitter.detectJsonBlockType,
  parseXmlAttributes: splitter.parseXmlAttributes,
  extractAudioLink: splitter.extractAudioLink,
  detectImageMarkdown: splitter.detectImageMarkdown,
  countInlineImages: splitter.countInlineImages,
  detectVideoMarkdown: splitter.detectVideoMarkdown,
  detectMatrxFileMarkdown: splitter.detectMatrxFileMarkdown,
  isCompleteUnrecognizedXmlContainer: splitter.isCompleteUnrecognizedXmlContainer,
  isUnclosedGenericXmlOpening: splitter.isUnclosedGenericXmlOpening,
  startUnrecognizedXmlContainer: splitter.startUnrecognizedXmlContainer,
  normalizeCodeLanguage: splitter.normalizeCodeLanguage,
};

export const chatContentIrSlots = {
  seedEnvelope,
  seedPersistedEnvelopeCache,
  withIrEnvelope,
  sessionEnvelope,
  envelopeForCompletedFenceRegion,
  envelopeForCompletedXmlRegion,
  contentIrKindRegistry: () => kindRegistry,
  contentIrComponentRegistry: () => componentRegistry,
  contentIrKindValidator: () => kindValidator,
  progressDataRenderBlock,
  contentSplitterPrimitives: () => contentSplitterPrimitives,
  KindInstanceRender,
  AnchorRecordsList,
  useAnchorRecords,
  fetchShapePage,
  fetchShapeByKind,
};

registerChatUi(chatContentIrSlots);
