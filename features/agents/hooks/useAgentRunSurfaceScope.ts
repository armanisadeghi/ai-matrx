/**
 * Build the surface scope for `matrx-user/agent-run`.
 *
 * Snapshots, at trigger time, everything the run page has loaded: the agent
 * definition that ran, the request that went in, the transcript that came
 * back, tool calls, completion stats, and live status.
 *
 * Reads through the store (not `useAppSelector`) so the returned builder is
 * stable and always pulls fresh state — the Agents chrome calls it only when
 * the user hits Run, which may be many renders after mount.
 *
 * Mounted by `AgentRunnerPage` via `<SurfaceRuntimeProvider>`, and only for
 * the standalone run route: the same component backs the `/code` workspace,
 * which is a different surface.
 */

import { useCallback } from "react";

import { useAppStore } from "@/lib/redux/hooks";
import { createAgentRunScope } from "@/features/surfaces/manifests/agent-run.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { extractAgentSystemInstruction } from "@/features/agents/utils/agent-system-instruction";
import {
  selectAgentDefinition,
  selectAgentDescription,
  selectAgentModelId,
  selectAgentName,
  selectAgentSystemMessage,
  selectAgentTools,
  selectAgentVariableDefinitions,
  selectAgentVersion,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  extractFlatText,
  selectConversationMessages,
  selectConversationTitle,
  selectMessageCount,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import {
  selectIsExecuting,
  selectIsStreaming,
  selectLatestAccumulatedReasoning,
  selectLatestAnswerText,
  selectLatestCompletion,
  selectLatestError,
  selectLatestToolLifecycles,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";

export interface AgentRunSurfaceScopeArgs {
  agentId: string;
  /** Active conversation for the run page. Undefined before one exists. */
  conversationId: string | undefined;
  /** Product surface that owns the run (`"agent-runner"` for /agents/[id]/run). */
  sourceFeature: string;
}

export function useAgentRunSurfaceScope({
  agentId,
  conversationId,
  sourceFeature,
}: AgentRunSurfaceScopeArgs): () => SurfaceScopePayload {
  const store = useAppStore();

  return useCallback(() => {
    const state = store.getState();

    const definition = selectAgentDefinition(state, agentId);
    const agentScope = {
      agent_id: agentId,
      agent_name: selectAgentName(state, agentId) ?? undefined,
      agent_description: selectAgentDescription(state, agentId) ?? undefined,
      agent_version: selectAgentVersion(state, agentId) ?? undefined,
      agent_system_instruction: extractAgentSystemInstruction(
        selectAgentSystemMessage(state, agentId),
      ),
      agent_model_id: selectAgentModelId(state, agentId) ?? undefined,
      agent_tools: selectAgentTools(state, agentId) ?? undefined,
      agent_variable_definitions:
        selectAgentVariableDefinitions(state, agentId) ?? undefined,
      agent_json: definition ? JSON.stringify(definition) : undefined,
      run_source_feature: sourceFeature,
    };

    // No conversation yet — the agent half is still fully honest.
    if (!conversationId) return createAgentRunScope(agentScope);

    const instance = selectInstance(conversationId)(state);
    const messages = selectConversationMessages(conversationId)(state);
    const latestUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const completion = selectLatestCompletion(conversationId)(state);
    const error = selectLatestError(conversationId)(state);
    const reasoning = selectLatestAccumulatedReasoning(conversationId)(state);
    const title = selectConversationTitle(conversationId)(state);

    return createAgentRunScope({
      ...agentScope,

      // ── Run identity ───────────────────────────────────────────────────
      run_conversation_id: conversationId,
      run_status: instance?.status ?? undefined,
      run_origin: instance?.origin ?? undefined,
      conversation_title: title ?? undefined,
      message_count: selectMessageCount(conversationId)(state),

      // ── Request ────────────────────────────────────────────────────────
      user_request: latestUserMessage
        ? extractFlatText(latestUserMessage)
        : undefined,
      user_input_draft: selectUserInputText(conversationId)(state) || undefined,
      variable_values: selectResolvedVariables(conversationId)(state),
      context_entries: selectInstanceContextEntries(conversationId)(state),

      // ── Response ───────────────────────────────────────────────────────
      agent_response:
        selectLatestAnswerText(conversationId)(state) ||
        lastAssistantText(messages),
      agent_reasoning: reasoning || undefined,
      all_messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: extractFlatText(m),
      })),
      tool_calls: selectLatestToolLifecycles(conversationId)(state) ?? [],
      completion_stats: completion
        ? (completion as unknown as Record<string, unknown>)
        : undefined,

      // ── Live state ─────────────────────────────────────────────────────
      is_streaming: selectIsStreaming(conversationId)(state),
      is_executing: selectIsExecuting(conversationId)(state),
      error_message: error?.message ?? undefined,
    });
  }, [store, agentId, conversationId, sourceFeature]);
}

/**
 * Fallback answer text for a RELOADED run: `selectLatestAnswerText` only
 * covers the live request stream, so a conversation loaded from history has
 * no active request and would otherwise report an empty response.
 */
function lastAssistantText(
  messages: ReturnType<ReturnType<typeof selectConversationMessages>>,
): string | undefined {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (!last) return undefined;
  const text = extractFlatText(last);
  return text.length > 0 ? text : undefined;
}
