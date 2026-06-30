"use client";

import { useEffect, useRef } from "react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useAgentLauncher } from "../../hooks/useAgentLauncher";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectAgentCustomExecutionPayload,
  selectAgentError,
  selectAgentFetchStatus,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectShowFreeformInput,
  selectShowVariablePanel,
  selectVariableInputStyle,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectShouldShowVariables } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  isProjectCreateFlow,
  logProjectCreateAiSnapshot,
  logProjectCreateAiStage,
} from "@/features/projects/debug/projectCreateAiDebug";
import { AgentRunner } from "./AgentRunner";

interface AgentRunWrapperProps {
  agentId: string;
  sourceFeature: SourceFeature;
  /**
   * Fired once each time a run finishes successfully (status transitions from
   * running/streaming → "complete"). Use it to react to side effects the agent
   * performed server-side — e.g. refetch a list the agent just wrote to.
   */
  onRunComplete?: () => void;
}

export function AgentRunWrapper({
  agentId,
  sourceFeature,
  onRunComplete,
}: AgentRunWrapperProps) {
  const surfaceKey = `${sourceFeature}:${agentId}`;
  const store = useAppStore();
  const debugProjectCreate = isProjectCreateFlow(sourceFeature, agentId);

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature,
    apiEndpointMode: "agent",
    autoClearConversation: false,
    config: {
      autoRun: false,
      allowChat: true,
      showVariablePanel: true,
      showDefinitionMessages: true,
      showDefinitionMessageContent: true,
      showPreExecutionGate: false,
    },
  });

  // Fire `onRunComplete` on the running/streaming → "complete" edge. The agent
  // writes directly to the DB server-side, so consumers can only learn the work
  // is done by watching the run reach a terminal success status.
  const status = useAppSelector(
    conversationId ? selectInstanceStatus(conversationId) : () => undefined,
  );
  const prevStatusRef = useRef<typeof status>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!onRunComplete) return;
    if (status === "complete" && (prev === "running" || prev === "streaming")) {
      onRunComplete();
    }
  }, [status, onRunComplete]);

  useEffect(() => {
    if (!debugProjectCreate) return;
    logProjectCreateAiStage("AgentRunWrapper mounted", {
      agentId,
      sourceFeature,
      surfaceKey,
      conversationId: conversationId ?? "(pending)",
    });
  }, [agentId, conversationId, debugProjectCreate, sourceFeature, surfaceKey]);

  // One diagnostic snapshot per conversationId — explains why variable fields
  // may be missing (RLS blocked agx_get_execution_full, empty definitions, etc.).
  const snapshottedConversationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!debugProjectCreate || !conversationId) return;
    if (snapshottedConversationRef.current === conversationId) return;

    const state = store.getState();
    const agentPayload = selectAgentCustomExecutionPayload(state, agentId);
    const agentError = selectAgentError(state, agentId);
    const agentFetchStatus = selectAgentFetchStatus(state, agentId);
    const definitions =
      selectInstanceVariableDefinitions(conversationId)(state);
    const showVariablePanel = selectShowVariablePanel(conversationId)(state);
    const shouldShowVariables =
      selectShouldShowVariables(conversationId)(state);
    const showFreeformInput = selectShowFreeformInput(conversationId)(state);
    const variablesPanelStyle = selectVariableInputStyle(conversationId)(state);
    const instanceStatus = selectInstanceStatus(conversationId)(state);
    const messageCount =
      state.messages?.byConversationId[conversationId]?.orderedIds?.length ?? 0;

    snapshottedConversationRef.current = conversationId;

    logProjectCreateAiStage("instance ready — checking variable panel inputs", {
      conversationId,
      agentExecutionPayloadReady: agentPayload.isReady,
      agentFetchStatus: agentFetchStatus ?? "(no agent row in Redux)",
      agentError: agentError ?? "(none)",
      agentVariableDefinitionCount:
        agentPayload.variableDefinitions?.length ?? 0,
      instanceVariableDefinitionCount: definitions.length,
      showVariablePanel,
      shouldShowVariables,
      showFreeformInput,
      variablesPanelStyle,
      instanceStatus: instanceStatus ?? "(unset)",
      messageCount,
    });

    if (definitions.length === 0 || !shouldShowVariables) {
      logProjectCreateAiSnapshot("variable panel blocked", {
        likelyCause:
          !agentPayload.isReady && agentError
            ? "agx_get_execution_full failed — check RLS / agent access"
            : !agentPayload.isReady
              ? "agent execution payload not loaded yet or returned empty row"
              : agentPayload.variableDefinitions?.length === 0
                ? "agent loaded but variable_definitions is empty"
                : !showVariablePanel
                  ? "showVariablePanel is false on the instance"
                  : messageCount > 0
                    ? "messages already exist — variables hidden after first turn"
                    : "shouldShowVariables is false for another reason",
        agentId,
        conversationId,
        agentPayloadReady: agentPayload.isReady,
        agentFetchStatus,
        agentError,
        agentVariableDefinitions: agentPayload.variableDefinitions,
        instanceDefinitions: definitions,
        showVariablePanel,
        shouldShowVariables,
        showFreeformInput,
        variablesPanelStyle,
        instanceStatus,
        messageCount,
      });
    }
  }, [agentId, conversationId, debugProjectCreate, store]);

  if (!conversationId) return null;

  return (
    <AgentRunner conversationId={conversationId} surfaceKey={surfaceKey} />
  );
}
