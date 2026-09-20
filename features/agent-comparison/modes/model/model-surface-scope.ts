"use client";

import { useAppStore } from "@/lib/redux/hooks";
import { createAgentComparisonModelScope } from "@/features/surfaces/manifests/agent-comparison-model.manifest";
import { blindAnonLabel } from "@/features/agent-comparison/shared/blind";
import { RESPONSE_FEEDBACK_METRICS } from "@/features/agent-comparison/shared/feedbackMetrics";
import {
  extractFlatText,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { selectInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectIsExecuting,
  selectLatestAnswerText,
  selectLatestCompletion,
  selectLatestError,
  selectLatestRequestStatus,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectAgentDescription,
  selectAgentName,
  selectAgentVersion,
} from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

const MODEL_SURFACE_NAME = "matrx-user/agent-comparison-model";

const VISIBLE_TRANSCRIPT_ROLES = new Set(["user", "assistant"]);

function safeResourceSummary(resource: {
  blockType: string;
  status: string;
  preview: unknown;
  errorMessage: string | null;
  options: {
    keepFresh: boolean;
    editable: boolean;
    convertToText: boolean;
    optionalContext: boolean;
    representation?: string;
  };
}) {
  return {
    block_type: resource.blockType,
    status: resource.status,
    preview:
      typeof resource.preview === "string" ? resource.preview : undefined,
    error_message: resource.errorMessage ?? undefined,
    options: resource.options,
  };
}

function safeContextEntry(entry: {
  key: string;
  value: unknown;
  type: string;
  slotMatched: boolean;
}) {
  return {
    key: entry.key,
    value: entry.value,
    type: entry.type,
    slot_matched: entry.slotMatched,
  };
}

export function buildModelBattleScope(state: RootState): SurfaceScopePayload {
  const battle = state.agentComparisonModel;
  const locked = battle.locked;
  const inputConversationId = battle.inputConversationId;
  const blind = state.agentComparison.blind;
  const identitiesAvailable = !blind.active || blind.revealed;
  const submitting = battle.isSubmittingAll;

  const sharedResources = inputConversationId
    ? Object.values(
        state.instanceResources.byConversationId[inputConversationId] ?? {},
      )
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(safeResourceSummary)
    : [];
  const sharedContextEntries = inputConversationId
    ? selectInstanceContextEntries(inputConversationId)(state).map(
        safeContextEntry,
      )
    : [];

  const outcomes = battle.columns.map((column) => {
    const messages = selectConversationMessages(column.conversationId)(state);
    const instance = selectInstance(column.conversationId)(state);
    const anonymizedLabel = blindAnonLabel(column.columnId, blind.order);
    const latestError = selectLatestError(column.conversationId)(state);
    const effectiveAnswer = selectLatestAnswerText(column.conversationId)(
      state,
    );
    const transcript = messages
      .filter((message) => VISIBLE_TRANSCRIPT_ROLES.has(message.role))
      .map((message) => ({
        role: message.role,
        text: extractFlatText(message),
      }));
    const lastAssistantIndex = transcript.findLastIndex(
      (message) => message.role === "assistant",
    );
    if (effectiveAnswer) {
      if (lastAssistantIndex >= 0) {
        transcript[lastAssistantIndex] = {
          ...transcript[lastAssistantIndex],
          text: effectiveAnswer,
        };
      } else {
        transcript.push({ role: "assistant", text: effectiveAnswer });
      }
    }
    const feedback =
      state.agentComparison.feedbackByConversation[column.conversationId];
    const feedbackSummary = feedback
      ? {
          rating: feedback.rating,
          overall: feedback.overall,
          rank: feedback.rank,
          scores: feedback.scores,
          note: feedback.comment,
        }
      : undefined;
    const common = {
      column_label: identitiesAvailable ? column.label : anonymizedLabel,
      status: instance?.status ?? "draft",
      request_status:
        selectLatestRequestStatus(column.conversationId)(state) ?? undefined,
      is_running: selectIsExecuting(column.conversationId)(state),
      transcript,
      latest_response: effectiveAnswer || undefined,
      feedback: feedbackSummary,
      ...(identitiesAvailable
        ? { error_message: latestError?.message }
        : { failed: Boolean(latestError) }),
    };

    if (!identitiesAvailable) return common;

    const overrides =
      state.instanceModelOverrides.byConversationId[column.conversationId];
    const selectedModel =
      overrides?.overrides.model ?? overrides?.baseSettings.model;
    const modelId =
      typeof selectedModel === "string" ? selectedModel : undefined;
    const model = modelId ? state.modelRegistry.entities[modelId] : undefined;
    const completion = selectLatestCompletion(column.conversationId)(state);
    return {
      ...common,
      column_id: column.columnId,
      conversation_id: column.conversationId,
      model: modelId
        ? {
            id: modelId,
            label: model?.common_name ?? model?.name ?? modelId,
          }
        : undefined,
      completion_metrics: completion ?? undefined,
    };
  });

  const activeRunCount = battle.columns.filter((column) =>
    selectIsExecuting(column.conversationId)(state),
  ).length;

  return createAgentComparisonModelScope({
    content: inputConversationId
      ? selectUserInputText(inputConversationId)(state) || undefined
      : undefined,
    context: {
      surface: "model_battle",
      blind_active: blind.active,
      identity_available: identitiesAvailable,
    },
    locked_agent: locked.agentId
      ? {
          id: locked.agentId,
          name: selectAgentName(state, locked.agentId) ?? undefined,
          description:
            selectAgentDescription(state, locked.agentId) ?? undefined,
          version: locked.agentVersion ?? undefined,
          version_id: locked.agentVersionId ?? undefined,
          current_version:
            selectAgentVersion(state, locked.agentId) ?? undefined,
        }
      : undefined,
    shared_user_input_draft: inputConversationId
      ? selectUserInputText(inputConversationId)(state) || undefined
      : undefined,
    shared_variables: inputConversationId
      ? selectResolvedVariables(inputConversationId)(state)
      : undefined,
    shared_resources: sharedResources.length > 0 ? sharedResources : undefined,
    shared_context_entries:
      sharedContextEntries.length > 0 ? sharedContextEntries : undefined,
    model_outcomes: outcomes.length > 0 ? outcomes : undefined,
    feedback_metric_definitions: [...RESPONSE_FEEDBACK_METRICS],
    model_feedback:
      outcomes.length > 0
        ? outcomes.map((outcome) => ({
            column_label: outcome.column_label,
            feedback: outcome.feedback,
            ...(identitiesAvailable && "column_id" in outcome
              ? { column_id: outcome.column_id }
              : {}),
          }))
        : undefined,
    comparison_set:
      identitiesAvailable && battle.activeSetId
        ? { id: battle.activeSetId, name: battle.activeSetName ?? undefined }
        : undefined,
    comparison_state: {
      is_submitting: submitting,
      active_run_count: activeRunCount,
      blind_active: blind.active,
      blind_revealed: blind.revealed,
      identity_available: identitiesAvailable,
    },
  });
}

/** Reads the currently mounted Model Battle state only when a launcher opens. */
export function useModelBattleSurfaceScope(): () => SurfaceScopePayload {
  const store = useAppStore();
  return () => buildModelBattleScope(store.getState());
}

export function isModelBattleWriteLocked(state: RootState): boolean {
  if (state.agentComparisonModel.isSubmittingAll) return true;
  return state.agentComparisonModel.columns.some((column) =>
    selectIsExecuting(column.conversationId)(state),
  );
}

export function modelBattleVariableDefinitions(state: RootState) {
  const conversationId = state.agentComparisonModel.inputConversationId;
  return conversationId
    ? selectInstanceVariableDefinitions(conversationId)(state)
    : [];
}

export { MODEL_SURFACE_NAME };
