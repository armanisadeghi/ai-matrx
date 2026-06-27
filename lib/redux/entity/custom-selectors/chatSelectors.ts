// @ts-nocheck

// lib/redux/entity/custom-selectors/chatSelectors.ts
"use client";

import { createSelector } from "@reduxjs/toolkit";
import { EntityKeys, EntityFieldKeys } from "@/types/entityTypes";
import type { RootState } from "@/lib/redux/store";
import {
  RuntimeFilter,
  RuntimeSort,
} from "@/lib/redux/entity/types/stateTypes";
import { createEntitySelectors } from "../selectors";
import { MatrxRecordId } from "@/types/entityTypes";
import {
  AiModelState,
  ConversationState,
  MessageState,
} from "@/types/AutomationSchemaTypes";
import {
  AiModelRecordMap,
  AiModelRecordWithKey,
  ConversationDataOptional,
  ConversationRecordMap,
  ConversationRecordWithKey,
  MessageDataOptional,
  AiModelDataOptional,
  MessageRecordMap,
  MessageRecordWithKey,
} from "@/types/AutomationSchemaTypes";
import { MarkdownAnalysisData } from "@/components/mardown-display/chat-markdown/analyzer/types";
import { InputControlsSettings } from "@/lib/types/input-controls";
import { ClassifiedMetadata } from "@/components/mardown-display/chat-markdown/analyzer/types";

const trace = "ENTITY SELECTORS";

export const createChatSelectors = () => {
  const conversationEntity = "conversation" as EntityKeys;
  const messageEntity = "message" as EntityKeys;
  const aiModelEntity = "aiModel" as EntityKeys;

  const conversationSelectors = createEntitySelectors("conversation");
  const messageSelectors = createEntitySelectors("message");
  const aiModelSelectors = createEntitySelectors("aiModel");

  if (!conversationSelectors || !messageSelectors || !aiModelSelectors) {
    throw new Error("Failed to create selectors for chat entities");
  }

  const selectConversationEntity = (state: RootState): ConversationState => {
    const conversationState = state.entities?.[
      conversationEntity
    ] as ConversationState;
    if (!conversationState) return {} as ConversationState;
    return conversationState;
  };

  const selectMessageEntity = (state: RootState): MessageState => {
    const messageState = state.entities?.[messageEntity] as MessageState;
    if (!messageState) return {} as MessageState;
    return messageState;
  };

  const selectAiModelEntity = (state: RootState): AiModelState => {
    const aiModelState = state.entities?.[aiModelEntity] as AiModelState;
    if (!aiModelState) return {} as AiModelState;
    return aiModelState;
  };

  // ====== CORE CONVERSATION SELECTORS ======
  const conversations = (state: RootState) =>
    conversationSelectors.selectAllRecords(state) ||
    ({} as ConversationRecordMap);
  const conversationsArray = (state: RootState) =>
    conversationSelectors.selectRecordsArray(state) ||
    ([] as ConversationDataOptional[]);
  const unsavedConversations = (state: RootState) =>
    conversationSelectors.selectUnsavedRecords(state) ||
    ({} as ConversationRecordMap);
  const effectiveConversations = (state: RootState) =>
    conversationSelectors.selectAllEffectiveRecords(state) ||
    ({} as ConversationRecordMap);
  const effectiveConversationsArray = (state: RootState) =>
    conversationSelectors.selectAllEffectiveRecordsArray(state) ||
    ([] as ConversationDataOptional[]);
  const activeConversation = (state: RootState) =>
    conversationSelectors.selectActiveRecord(state);
  const activeConversationKey = createSelector(
    [selectConversationEntity],
    (entity): MatrxRecordId | undefined => {
      if (!entity?.selection.activeRecord) return undefined;
      return entity.selection.activeRecord as MatrxRecordId;
    },
  );

  const activeConversationId = createSelector(
    [activeConversation],
    (conversation): string | undefined => {
      if (!conversation) return undefined;
      return conversation.id;
    },
  );

  const conversationsByFieldValue = createSelector(
    [
      conversationSelectors.selectRecordsArray,
      (_: RootState, field: EntityFieldKeys<typeof conversationEntity>) =>
        field,
      (
        _: RootState,
        _field: EntityFieldKeys<typeof conversationEntity>,
        value: unknown,
      ) => value,
    ],
    (records, field, value): ConversationDataOptional[] => {
      if (!records || !field) return [];

      return records.filter((record) => record[field] === value);
    },
  );

  // ====== CORE MESSAGE SELECTORS ======
  const messages = (state: RootState) =>
    messageSelectors.selectAllRecords(state) || ({} as MessageRecordMap);
  const messagesArray = (state: RootState) =>
    messageSelectors.selectRecordsArray(state) || ([] as MessageDataOptional[]);
  const unsavedMessages = (state: RootState) =>
    messageSelectors.selectUnsavedRecords(state) || ({} as MessageRecordMap);
  const effectiveMessages = (state: RootState) =>
    messageSelectors.selectAllEffectiveRecords(state) ||
    ({} as MessageRecordMap);
  const effectiveMessagesArray = (state: RootState) =>
    messageSelectors.selectAllEffectiveRecordsArray(state) ||
    ([] as MessageDataOptional[]);
  const activeMessage = (state: RootState) =>
    messageSelectors.selectActiveRecord(state);

  const activeMessageKey = createSelector(
    [selectMessageEntity],
    (entity): MatrxRecordId | undefined => {
      if (!entity?.selection.activeRecord) return undefined;
      return entity.selection.activeRecord as MatrxRecordId;
    },
  );

  const activeMessageId = createSelector(
    [activeMessage],
    (message): string | undefined => {
      if (!message) return undefined;
      return message.id;
    },
  );

  // ====== CORE AI MODEL SELECTORS ======
  const aiModels = (state: RootState) =>
    aiModelSelectors.selectAllRecords(state) || ({} as AiModelRecordMap);
  const aiModelsArray = (state: RootState) =>
    aiModelSelectors.selectRecordsArray(state) || ([] as AiModelDataOptional[]);
  const activeAiModel = (state: RootState) =>
    aiModelSelectors.selectActiveRecord(state);

  const activeAiModelKey = createSelector(
    [selectAiModelEntity],
    (entity): MatrxRecordId | undefined => {
      if (!entity?.selection.activeRecord) return undefined;
      return entity.selection.activeRecord as MatrxRecordId;
    },
  );

  const activeAiModelId = createSelector(
    [activeAiModel],
    (aiModel): string | undefined => {
      if (!aiModel) return undefined;
      return aiModel.id;
    },
  );

  // ====== DETAILED MESSAGE SELECTORS ======

  const messagesByFieldValue = createSelector(
    [
      messageSelectors.selectRecordsArray,
      (_: RootState, field: EntityFieldKeys<typeof messageEntity>) => field,
      (
        _: RootState,
        _field: EntityFieldKeys<typeof messageEntity>,
        value: unknown,
      ) => value,
    ],
    (records, field, value): MessageDataOptional[] => {
      if (!records || !field) return [];

      return records.filter((record) => record[field] === value);
    },
  );

  const messagesByConversationId = createSelector(
    [
      messageSelectors.selectRecordsArray,
      (_: RootState, conversationId: string) => conversationId,
    ],
    (
      records: MessageRecordWithKey[],
      conversationId: string,
    ): MessageRecordWithKey[] => {
      return records.filter(
        (record) => record.conversationId === conversationId,
      );
    },
  );

  const messagesByRole = createSelector(
    [messageSelectors.selectRecordsArray, (_: RootState, role: string) => role],
    (records: MessageRecordWithKey[], role: string): MessageRecordWithKey[] => {
      return records.filter((record) => record.role === role);
    },
  );

  const messagesByDisplayOrder = createSelector(
    [
      messageSelectors.selectRecordsArray,
      (_: RootState, displayOrder: number) => displayOrder,
    ],
    (
      records: MessageRecordWithKey[],
      displayOrder: number,
    ): MessageRecordWithKey[] => {
      return records.filter((record) => record.displayOrder === displayOrder);
    },
  );

  // Combined selector for messages to display
  const displayMessagesForConversation = createSelector(
    [
      messageSelectors.selectRecordsArray,
      (_: RootState, conversationId: string) => conversationId,
    ],
    (
      records: MessageRecordWithKey[],
      conversationId: string,
    ): MessageRecordWithKey[] => {
      if (!records || !conversationId) return [];

      return records.filter(
        (record) =>
          record.conversationId === conversationId &&
          record.displayOrder > 0 &&
          record.displayOrder !== undefined &&
          (record.role === "assistant" || record.role === "user"),
      );
    },
  );

  const activeChatMessages = createSelector(
    [messageSelectors.selectRecordsArray, activeConversationId],
    (records, activeConversationId) => {
      if (!records || !activeConversationId) return [];
      return records.filter(
        (record) => record.conversationId === activeConversationId,
      );
    },
  );

  const activeChatMessagesByRole = createSelector(
    [activeChatMessages, (_: RootState, role: string) => role],
    (activeMessages, role) => {
      if (!activeMessages || !role) return [];
      return activeMessages.filter((record) => record.role === role);
    },
  );

  const activeChatMessagesByDisplayOrder = createSelector(
    [activeChatMessages, (_: RootState, displayOrder: number) => displayOrder],
    (activeMessages, displayOrder) => {
      if (!activeMessages) return [];
      return activeMessages.filter(
        (record) => record.displayOrder === displayOrder,
      );
    },
  );

  const activeChatMessagesToDisplay = createSelector(
    [messageSelectors.selectRecordsArray, activeConversationId],
    (records, activeConversationId) => {
      if (!records || !activeConversationId) return [];
      return records.filter(
        (record) =>
          record.conversationId === activeConversationId &&
          record.displayOrder > 0 &&
          record.displayOrder !== undefined &&
          (record.role === "assistant" || record.role === "user"),
      );
    },
  );

  const aiModelsByFieldValue = createSelector(
    [
      aiModelSelectors.selectRecordsArray,
      (_: RootState, field: EntityFieldKeys<typeof aiModelEntity>) => field,
      (
        _: RootState,
        _field: EntityFieldKeys<typeof aiModelEntity>,
        value: unknown,
      ) => value,
    ],
    (records, field, value): AiModelDataOptional[] => {
      if (!records || !field) return [];

      return records.filter((record) => record[field] === value);
    },
  );

  const conversationCountByFieldValue = createSelector(
    [conversationsByFieldValue],
    (filteredRecords) => filteredRecords.length,
  );
  const messageCountByFieldValue = createSelector(
    [messagesByFieldValue],
    (filteredRecords) => filteredRecords.length,
  );
  const aiModelCountByFieldValue = createSelector(
    [aiModelsByFieldValue],
    (filteredRecords) => filteredRecords.length,
  );

  const conversationRuntimeFilters = createSelector(
    [selectConversationEntity],
    (entity): RuntimeFilter[] => entity?.runtimeFilters || [],
  );
  const messageRuntimeFilters = createSelector(
    [selectMessageEntity],
    (entity): RuntimeFilter[] => entity?.runtimeFilters || [],
  );
  const aiModelRuntimeFilters = createSelector(
    [selectAiModelEntity],
    (entity): RuntimeFilter[] => entity?.runtimeFilters || [],
  );

  const conversationRuntimeSort = createSelector(
    [selectConversationEntity],
    (entity): RuntimeSort =>
      entity?.runtimeSort || { field: "matrxRecordId", direction: "asc" },
  );

  const messageRuntimeSort = createSelector(
    [selectMessageEntity],
    (entity): RuntimeSort =>
      entity?.runtimeSort || { field: "matrxRecordId", direction: "asc" },
  );

  const aiModelRuntimeSort = createSelector(
    [selectAiModelEntity],
    (entity): RuntimeSort =>
      entity?.runtimeSort || { field: "matrxRecordId", direction: "asc" },
  );

  // New selector for relation-filtered records
  const conversationRelationFilteredRecords = createSelector(
    [
      conversationSelectors.selectRecordsArray,
      conversationRuntimeFilters,
      conversationRuntimeSort,
    ],
    (
      records: ConversationRecordWithKey[],
      runtimeFilters: RuntimeFilter[],
      runtimeSort: RuntimeSort,
    ) => {
      let result = [...records];

      for (const filter of runtimeFilters) {
        result = result.filter((item) =>
          filter.operator === "eq"
            ? item[filter.field as keyof ConversationRecordWithKey] ===
              filter.value
            : item[filter.field as keyof ConversationRecordWithKey] !==
              filter.value,
        );
      }

      // Apply runtime sort
      result.sort((a, b) => {
        const aValue = a[runtimeSort.field as keyof ConversationRecordWithKey];
        const bValue = b[runtimeSort.field as keyof ConversationRecordWithKey];
        return runtimeSort.direction === "asc"
          ? aValue > bValue
            ? 1
            : aValue < bValue
              ? -1
              : 0
          : bValue > aValue
            ? 1
            : bValue < aValue
              ? -1
              : 0;
      });

      return result;
    },
  );

  const messageRelationFilteredRecords = createSelector(
    [
      messageSelectors.selectRecordsArray,
      messageRuntimeFilters,
      messageRuntimeSort,
    ],
    (
      records: MessageRecordWithKey[],
      runtimeFilters: RuntimeFilter[],
      runtimeSort: RuntimeSort,
    ) => {
      let result = [...records];

      for (const filter of runtimeFilters) {
        result = result.filter((item) =>
          filter.operator === "eq"
            ? item[filter.field as keyof MessageRecordWithKey] === filter.value
            : item[filter.field as keyof MessageRecordWithKey] !== filter.value,
        );
      }

      // Apply runtime sort
      result.sort((a, b) => {
        const aValue = a[runtimeSort.field as keyof MessageRecordWithKey];
        const bValue = b[runtimeSort.field as keyof MessageRecordWithKey];
        return runtimeSort.direction === "asc"
          ? aValue > bValue
            ? 1
            : aValue < bValue
              ? -1
              : 0
          : bValue > aValue
            ? 1
            : bValue < aValue
              ? -1
              : 0;
      });

      return result;
    },
  );

  const isLastMessageAssistant = createSelector(
    [messageRelationFilteredRecords],
    (records) => {
      return records[records.length - 1]?.role === "assistant";
    },
  );

  const aiModelRelationFilteredRecords = createSelector(
    [
      aiModelSelectors.selectRecordsArray,
      aiModelRuntimeFilters,
      aiModelRuntimeSort,
    ],
    (
      records: AiModelRecordWithKey[],
      runtimeFilters: RuntimeFilter[],
      runtimeSort: RuntimeSort,
    ) => {
      let result = [...records];

      for (const filter of runtimeFilters) {
        result = result.filter((item) =>
          filter.operator === "eq"
            ? item[filter.field as keyof AiModelRecordWithKey] === filter.value
            : item[filter.field as keyof AiModelRecordWithKey] !== filter.value,
        );
      }

      // Apply runtime sort
      result.sort((a, b) => {
        const aValue = a[runtimeSort.field as keyof AiModelRecordWithKey];
        const bValue = b[runtimeSort.field as keyof AiModelRecordWithKey];
        return runtimeSort.direction === "asc"
          ? aValue > bValue
            ? 1
            : aValue < bValue
              ? -1
              : 0
          : bValue > aValue
            ? 1
            : bValue < aValue
              ? -1
              : 0;
      });

      return result;
    },
  );

  const conversationSocketEventName = createSelector(
    [selectConversationEntity],
    (entity): string | undefined => entity?.socketEventName,
  );

  const messageSocketEventName = createSelector(
    [selectMessageEntity],
    (entity): string | undefined => entity?.socketEventName,
  );
  const aiModelSocketEventName = createSelector(
    [selectAiModelEntity],
    (entity): string | undefined => entity?.socketEventName,
  );

  const conversationCustomData = createSelector(
    [selectConversationEntity],
    (entity): Record<string, unknown> | undefined => entity?.customData,
  );

  const isStreaming = createSelector(
    [conversationCustomData],
    (customData): any => customData?.isStreaming,
  );

  const conversationIsNew = createSelector(
    [conversationCustomData],
    (customData): boolean => customData?.isNewChat !== false,
  );

  const isDebugMode = createSelector(
    [conversationCustomData],
    (customData): boolean => Boolean(customData?.isDebugMode),
  );

  const taskId = createSelector(
    [conversationCustomData],
    (customData): string | undefined =>
      customData?.taskId as string | undefined,
  );

  const messageCustomData = createSelector(
    [selectMessageEntity],
    (entity): Record<string, unknown> | undefined => entity?.customData,
  );
  const aiModelCustomData = createSelector(
    [selectAiModelEntity],
    (entity): Record<string, unknown> | undefined => entity?.customData,
  );

  const hasMinOneConversation = createSelector(
    [conversationSelectors.selectAllRecords],
    (records): boolean => Object.keys(records).length > 0,
  );
  const hasMinOneAiModel = createSelector(
    [aiModelSelectors.selectAllRecords],
    (records): boolean => Object.keys(records).length > 0,
  );
  const hasMinOneMessage = createSelector(
    [messageSelectors.selectAllRecords],
    (records): boolean => Object.keys(records).length > 0,
  );

  const conversationIsLoading = createSelector(
    [selectConversationEntity],
    (entity): boolean => entity?.loading.loading,
  );
  const messageIsLoading = createSelector(
    [selectMessageEntity],
    (entity): boolean => entity?.loading.loading,
  );

  const chatIsLoading = createSelector(
    [conversationIsLoading, messageIsLoading],
    (conversationIsLoading, messageIsLoading) =>
      conversationIsLoading || messageIsLoading,
  );

  const initialLoadComplete = createSelector(
    [
      hasMinOneConversation,
      hasMinOneAiModel,
      activeConversationKey,
      conversationIsLoading,
    ],
    (hasConversation, hasAiModel, hasConversationKey, isLoading) => {
      // Standard case: Has conversations, AI models, and active conversation
      if (hasConversation && hasAiModel && hasConversationKey) {
        return true;
      }

      // New user case: No conversations but loading is complete and AI models are available
      if (!isLoading && !hasConversation && hasAiModel) {
        return true;
      }

      return false;
    },
  );

  const isConversationExternalLoading = createSelector(
    [selectConversationEntity],
    (entity): boolean => entity?.loading.externalLoading,
  );

  const isMessageExternalLoading = createSelector(
    [selectMessageEntity],
    (entity): boolean => entity?.loading.externalLoading,
  );

  const hasMinOneActiveMessage = createSelector(
    [activeChatMessagesToDisplay],
    (records) => records.length > 0,
  );

  const routeLoadComplete = createSelector(
    [
      initialLoadComplete,
      hasMinOneActiveMessage,
      messageIsLoading,
      isConversationExternalLoading,
    ],
    (
      initialLoadComplete,
      hasActiveMessage,
      messageIsLoading,
      isConversationExternalLoading,
    ) =>
      initialLoadComplete &&
      hasActiveMessage &&
      !messageIsLoading &&
      !isConversationExternalLoading,
  );

  const activeMessageMetadata = createSelector(
    [activeMessage],
    (message) => message?.metadata,
  );
  const activeMessageStatus = createSelector(
    [activeMessageMetadata],
    (metadata) => metadata?.status,
  );
  const shouldShowLoader = createSelector(
    [activeMessageStatus],
    (status) => status == "submitted" || status == "processing",
  );

  const activeMessageSettings = createSelector(
    [activeMessageMetadata],
    (metadata): InputControlsSettings => {
      const settings: InputControlsSettings = {
        searchEnabled: false,
        toolsEnabled: false,
        thinkEnabled: false,
        researchEnabled: false,
        recipesEnabled: false,
        planEnabled: false,
        audioEnabled: false,
        enableAskQuestions: false,
        enableBrokers: false,
        hasFiles: false,
        generateImages: false,
        generateVideos: false,
      };

      // If no metadata, return default settings (all false)
      if (!metadata) {
        return settings;
      }

      // Process straightforward settings
      // Only set to true if explicitly true in metadata
      if (metadata.toolsEnabled === true) settings.toolsEnabled = true;
      if (metadata.searchEnabled === true) settings.searchEnabled = true;
      if (metadata.thinkEnabled === true) settings.thinkEnabled = true;
      if (metadata.enableAskQuestions === true)
        settings.enableAskQuestions = true;
      if (metadata.enableBrokers === true) settings.enableBrokers = true;
      if (metadata.audioEnabled === true) settings.audioEnabled = true;
      if (metadata.planEnabled === true) settings.planEnabled = true;
      if (metadata.researchEnabled === true) settings.researchEnabled = true;
      if (metadata.recipesEnabled === true) settings.recipesEnabled = true;

      // Process files - if we have any files, enable research
      if (
        metadata.files &&
        Array.isArray(metadata.files) &&
        metadata.files.length > 0
      ) {
        settings.hasFiles = true;
      }

      if (metadata.currentMode === "images") {
        settings.generateImages = true;
      }

      if (metadata.currentMode === "videos") {
        settings.generateVideos = true;
      }

      // Add any additional computed settings here
      // For example, if you want to enable recipes based on other metadata
      if (metadata.recipesEnabled === true) {
        settings.recipesEnabled = true;
      }

      // Return the computed settings
      return settings;
    },
  );

  const activeConversationMetadata = createSelector(
    [activeConversation],
    (conversation) => conversation?.metadata,
  );

  const availableTools = createSelector(
    [activeMessageMetadata],
    (metadata) => metadata?.availableTools,
  );
  const availableBrokers = createSelector(
    [activeMessageMetadata],
    (metadata) => metadata?.availableBrokers,
  );

  const selectMarkdownAnalysisData = createSelector(
    [messagesArray, (_state: RootState, messageId: string) => messageId],
    (messages, messageId): MarkdownAnalysisData | undefined => {
      const message = messages.find((msg) => msg.id === messageId);
      return message?.metadata?.markdownAnalysis as
        | MarkdownAnalysisData
        | undefined;
    },
  );

  const selectMessageMetadata = createSelector(
    [messagesArray, (_state: RootState, messageId: string) => messageId],
    (messages, messageId): ClassifiedMetadata | undefined => {
      const message = messages.find((msg) => msg.id === messageId);
      return message?.metadata;
    },
  );

  const files = createSelector(
    [activeMessageMetadata],
    (metadata) => metadata?.files,
  );

  const activeMessageFiles = createSelector(
    [activeMessageMetadata],
    (metadata) => metadata?.files,
  );

  const currentMode = createSelector(
    [activeConversationMetadata],
    (metadata) => metadata?.currentMode,
  );

  return {
    selectConversationEntity,
    selectMessageEntity,
    selectAiModelEntity,
    conversations,
    messages,
    conversationsArray,
    messagesArray,
    aiModels,
    aiModelsArray,
    conversationRuntimeFilters,
    messageRuntimeFilters,
    aiModelRuntimeFilters,
    conversationRuntimeSort,
    messageRuntimeSort,
    aiModelRuntimeSort,
    conversationRelationFilteredRecords,
    messageRelationFilteredRecords,
    aiModelRelationFilteredRecords,
    conversationSocketEventName,
    messageSocketEventName,
    aiModelSocketEventName,
    conversationCustomData,
    conversationIsNew,
    messageCustomData,
    aiModelCustomData,
    activeConversationKey,
    activeConversation,
    activeConversationId,
    activeMessageKey,
    activeMessage,
    activeMessageId,
    activeAiModelKey,
    activeAiModel,
    activeAiModelId,
    hasMinOneMessage,
    hasMinOneAiModel,
    hasMinOneConversation,
    conversationsByFieldValue,
    messagesByFieldValue,
    aiModelsByFieldValue,
    conversationCountByFieldValue,
    messageCountByFieldValue,
    aiModelCountByFieldValue,
    activeChatMessages,
    activeChatMessagesByRole,
    activeChatMessagesByDisplayOrder,
    activeChatMessagesToDisplay,
    messagesByConversationId,
    messagesByRole,
    messagesByDisplayOrder,
    displayMessagesForConversation,
    conversationIsLoading,
    messageIsLoading,
    chatIsLoading,
    initialLoadComplete,
    hasMinOneActiveMessage,
    routeLoadComplete,
    isConversationExternalLoading,
    isMessageExternalLoading,

    activeMessageMetadata,
    activeConversationMetadata,
    availableTools,
    availableBrokers,
    files,
    activeMessageFiles,
    currentMode,
    effectiveConversations,
    effectiveConversationsArray,
    effectiveMessages,
    effectiveMessagesArray,

    isLastMessageAssistant,
    isStreaming,
    selectMarkdownAnalysisData,
    selectMessageMetadata,

    // New selectors
    activeMessageSettings,
    activeMessageStatus,
    shouldShowLoader,

    isDebugMode,
    taskId,
  };
};

export default createChatSelectors;
export type ChatSelectors = ReturnType<typeof createChatSelectors>;
