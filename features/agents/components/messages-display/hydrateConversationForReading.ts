/**
 * The ONE read-only open sequence for a past conversation — what the chat
 * history window does when a row is picked, and what every other read-only
 * host (the Knowledge hub's peek) does to show the same transcript through
 * `AgentConversationDisplay`.
 *
 * Mirrors the /chat load: warm the agent's execution payload and create the
 * instance BEFORE hydrating, so assistant turns render (without the instance
 * they rendered blank). Only the instance create must precede the load.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";

export async function hydrateConversationForReading(
  dispatch: AppDispatch,
  getState: () => RootState,
  opts: { conversationId: string; agentId: string | null; surfaceKey: string },
): Promise<void> {
  const { conversationId, agentId, surfaceKey } = opts;
  const exists = !!getState().conversations?.byConversationId?.[conversationId];
  if (agentId) {
    void dispatch(fetchAgentExecutionMinimal(agentId));
    if (!exists) {
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          apiEndpointMode: "agent",
          responseDensity: "compact",
        }),
      );
    }
  }
  await dispatch(loadConversation({ conversationId, surfaceKey }));
}
