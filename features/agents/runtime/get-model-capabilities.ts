// features/agents/runtime/get-model-capabilities.ts
//
// Resolves the canonical `ModelCapabilities` for the agent attached to
// a conversation. Sync — reads only Redux state. Returns `null` when
// the agent or its model isn't loaded yet (caller decides whether to
// warn or skip).
//
// Used by:
//   - execute-instance.thunk.ts → validateMessageBlocks (Step 3a)
//   - process-stream.ts          → modelProducesOutput guard (Step 3d)
//   - any component that needs a quick capabilities lookup
//
// Hot-path-safe: pure selectors + the parser. No allocations beyond
// what the parser does.

import type { RootState } from "@/lib/redux/store";
import { selectModelById } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  parseCapabilities,
  type ModelCapabilities,
} from "@/features/ai-models/capabilities/parse";

/** Resolves capabilities from the agent attached to `conversationId`. */
export function getCapabilitiesForConversation(
  state: RootState,
  conversationId: string,
): ModelCapabilities | null {
  const instance = state.conversations.byConversationId[conversationId];
  if (!instance?.agentId) return null;
  const agent = state.agentDefinition.agents?.[instance.agentId];
  if (!agent?.modelId) return null;
  const model = selectModelById(state, agent.modelId);
  if (!model) return null;
  return parseCapabilities(model.capabilities, {
    api_class: model.api_class,
    provider: model.provider,
  });
}

/** Resolves capabilities for an arbitrary model id. */
export function getCapabilitiesForModel(
  state: RootState,
  modelId: string,
): ModelCapabilities | null {
  const model = selectModelById(state, modelId);
  if (!model) return null;
  return parseCapabilities(model.capabilities, {
    api_class: model.api_class,
    provider: model.provider,
  });
}
