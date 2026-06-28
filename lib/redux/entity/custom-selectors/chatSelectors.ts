/** @deprecated Legacy entity chat selectors — compile-only tombstone. */

import type { RootState } from "@/lib/redux/store";

const emptyArray: unknown[] = [];
const emptyObject = {};

const noopSelector = (_state: RootState) => undefined;
const falseSelector = (_state: RootState) => false;
const emptyArraySelector = (_state: RootState) => emptyArray;
const emptyObjectSelector = (_state: RootState) => emptyObject;

export function createChatSelectors() {
  return {
    activeConversationId: noopSelector,
    activeConversationKey: noopSelector,
    activeMessageId: noopSelector,
    activeMessageKey: noopSelector,
    conversationSocketEventName: noopSelector,
    initialLoadComplete: falseSelector,
    routeLoadComplete: falseSelector,
    taskId: noopSelector,
    isStreaming: falseSelector,
    activeMessageSettings: emptyObjectSelector,
    shouldShowLoader: falseSelector,
    messageRelationFilteredRecords: emptyArraySelector,
    activeMessageStatus: noopSelector,
    isDebugMode: falseSelector,
    activeMessageMetadata: emptyObjectSelector,
    activeConversationMetadata: emptyObjectSelector,
    currentMode: noopSelector,
    aiModels: emptyArraySelector,
    activeMessage: noopSelector,
    activeMessageFiles: emptyArraySelector,
    availableBrokers: emptyArraySelector,
    availableTools: emptyArraySelector,
    conversationsArray: emptyArraySelector,
    selectMarkdownAnalysisData: (_state: RootState, _messageId: string) => undefined,
  };
}

export default createChatSelectors;
