/**
 * Build the agent-level surface scope for `matrx-user/agent-builder`.
 *
 * Returns the agent-definition half of the scope (everything an action that
 * operates on "the agent being edited" needs): identity, model, tools,
 * context slots, variable definitions, output schema, settings, and the full
 * agent serialized as JSON.
 *
 * Callsites merge this with the field-specific `content` they're editing and
 * pass the result as `contextData` to `<UnifiedAgentContextMenu>`. Selection /
 * text_before / text_after come from the menu's own `getTextarea` callback, so
 * this hook does not emit them.
 *
 * Usage:
 *
 *   const buildAgentScope = useAgentBuilderSurfaceScope(agentId);
 *   <UnifiedAgentContextMenu
 *     surfaceName="matrx-user/agent-builder"
 *     contextData={{ ...buildAgentScope(), content: messageText,
 *                    system_instruction: messageText, focused_field: "system_instruction" }}
 *   />
 */

import { useCallback } from "react";

import { useAppStore } from "@/lib/redux/hooks";
import { createAgentBuilderScope } from "@/features/surfaces/manifests/agent-builder.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  selectAgentContextSlots,
  selectAgentCustomTools,
  selectAgentDefinition,
  selectAgentDescription,
  selectAgentIsDirty,
  selectAgentMcpServers,
  selectAgentModelId,
  selectAgentName,
  selectAgentOutputSchema,
  selectAgentSettings,
  selectAgentTags,
  selectAgentTools,
  selectAgentType,
  selectAgentVariableDefinitions,
  selectAgentVersion,
} from "@/features/agents/redux/agent-definition/selectors";

/**
 * Returns a builder that snapshots the active agent definition from Redux at
 * call time and emits the agent-level portion of the agent-builder surface
 * scope. Reads via the store (not `useAppSelector`) so the returned function
 * is stable and pulls fresh state on each invocation.
 */
export function useAgentBuilderSurfaceScope(
  agentId: string | undefined,
): () => SurfaceScopePayload {
  const store = useAppStore();

  return useCallback(() => {
    if (!agentId) return createAgentBuilderScope({});
    const state = store.getState();

    const definition = selectAgentDefinition(state, agentId);
    const outputSchema = selectAgentOutputSchema(state, agentId);
    const settings = selectAgentSettings(state, agentId);

    return createAgentBuilderScope({
      agent_id: agentId,
      agent_name: selectAgentName(state, agentId) ?? undefined,
      agent_description: selectAgentDescription(state, agentId) ?? undefined,
      agent_type: selectAgentType(state, agentId) ?? undefined,
      agent_version: selectAgentVersion(state, agentId) ?? undefined,
      agent_tags: selectAgentTags(state, agentId) ?? undefined,
      agent_model_id: selectAgentModelId(state, agentId) ?? undefined,
      agent_tools: selectAgentTools(state, agentId) ?? undefined,
      agent_custom_tools: selectAgentCustomTools(state, agentId) ?? undefined,
      agent_mcp_servers: selectAgentMcpServers(state, agentId) ?? undefined,
      agent_context_slots: selectAgentContextSlots(state, agentId) ?? undefined,
      agent_variable_definitions:
        selectAgentVariableDefinitions(state, agentId) ?? undefined,
      agent_output_schema:
        (outputSchema as unknown as Record<string, unknown> | null) ??
        undefined,
      agent_settings: (settings as Record<string, unknown> | null) ?? undefined,
      agent_json: definition ? JSON.stringify(definition) : undefined,
      is_dirty: selectAgentIsDirty(state, agentId),
    });
  }, [store, agentId]);
}
