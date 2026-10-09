/**
 * The builder's latest TEST RUN as agent-builder surface values (Agent Factory R58).
 *
 * The test panel (`AgentBuilderRightPanel`, surface key `agent-builder:<agentId>`) is the
 * page's own conversation, so it never rides the page as context by itself
 * (`isOwnConversation`). The Side Chat helper beside the builder needs it: the values the
 * agent ran with, what the person typed, the answer and the whole exchange — declared on
 * the manifest as `test_run_*` (`@ai-matrx/chat` agent-builder.manifest.ts) and emitted
 * here at send time, read straight from the store the panel itself renders from.
 *
 * Absent until the panel has a conversation with at least one message.
 */

import { selectResolvedVariables } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  extractFlatText,
  selectConversationMessages,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";

export interface AgentBuilderTestRun {
  test_run_conversation_id: string;
  test_run_variables?: Record<string, unknown>;
  test_run_user_input?: string;
  test_run_response?: string;
  test_run_transcript: { role: string; text: string }[];
}

/** The surface key the builder's test panel focuses its conversation under. */
export function agentBuilderTestSurfaceKey(agentId: string): string {
  return `agent-builder:${agentId}`;
}

/** The test run of `agentId` in `state`, or null when nothing has run in the panel. */
export function agentBuilderTestRun(state: ChatRootState, agentId: string): AgentBuilderTestRun | null {
  const focus = state.conversationFocus?.bySurface[agentBuilderTestSurfaceKey(agentId)];
  // `display` is the conversation the panel shows (the run); `input` may already be a fresh one.
  const candidates = [focus?.display, focus?.input].filter((id): id is string => Boolean(id));
  for (const conversationId of candidates) {
    const messages = selectConversationMessages(conversationId)(state);
    const transcript = messages
      .filter((m) => m.isVisibleToUser !== false && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, text: extractFlatText(m).trim() }))
      .filter((m) => m.text !== "");
    if (transcript.length === 0) continue;
    const lastUser = [...transcript].reverse().find((m) => m.role === "user");
    const last = transcript[transcript.length - 1];
    const variables = selectResolvedVariables(conversationId)(state);
    return {
      test_run_conversation_id: conversationId,
      ...(variables && Object.keys(variables).length > 0 ? { test_run_variables: variables } : {}),
      ...(lastUser ? { test_run_user_input: lastUser.text } : {}),
      ...(last.role === "assistant" ? { test_run_response: last.text } : {}),
      test_run_transcript: transcript,
    };
  }
  return null;
}
