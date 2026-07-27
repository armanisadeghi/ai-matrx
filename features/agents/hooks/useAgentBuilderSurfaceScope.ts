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
  selectAgentAccessLevel,
  selectAgentCategory,
  selectAgentChangeNote,
  selectAgentContextSlots,
  selectAgentCustomTools,
  selectAgentDefinition,
  selectAgentDescription,
  selectAgentDirtyFields,
  selectAgentIsActive,
  selectAgentIsArchived,
  selectAgentIsDirty,
  selectAgentIsFavorite,
  selectAgentIsForked,
  selectAgentIsOwner,
  selectAgentIsPublic,
  selectAgentIsReadOnly,
  selectAgentIsVersion,
  selectAgentMatrxActions,
  selectAgentMcpServers,
  selectAgentMessages,
  selectAgentModelId,
  selectAgentModelTiers,
  selectAgentName,
  selectAgentOutputSchema,
  selectAgentParentAgentId,
  selectAgentSettings,
  selectAgentSkillConfig,
  selectAgentSourceId,
  selectAgentSystemMessage,
  selectAgentTags,
  selectAgentTools,
  selectAgentType,
  selectAgentUiGates,
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
    const dirtyFields = selectAgentDirtyFields(state, agentId);
    const isOwner = selectAgentIsOwner(state, agentId);

    return createAgentBuilderScope({
      // ── Identity ───────────────────────────────────────────────────────
      agent_id: agentId,
      agent_name: selectAgentName(state, agentId) ?? undefined,
      agent_description: selectAgentDescription(state, agentId) ?? undefined,
      agent_type: selectAgentType(state, agentId) ?? undefined,
      agent_category: selectAgentCategory(state, agentId) ?? undefined,
      agent_tags: selectAgentTags(state, agentId) ?? undefined,

      // ── Definition ─────────────────────────────────────────────────────
      system_instruction: extractSystemInstruction(
        selectAgentSystemMessage(state, agentId),
      ),
      agent_messages: selectAgentMessages(state, agentId) ?? undefined,
      agent_model_id: selectAgentModelId(state, agentId) ?? undefined,
      agent_model_tiers: selectAgentModelTiers(state, agentId) ?? undefined,
      agent_output_schema:
        (outputSchema as Record<string, unknown> | null) ?? undefined,
      agent_settings: (settings as Record<string, unknown> | null) ?? undefined,
      agent_ui_gates: selectAgentUiGates(state, agentId) as Record<
        string,
        unknown
      >,
      agent_json: definition ? JSON.stringify(definition) : undefined,

      // ── Capabilities ───────────────────────────────────────────────────
      agent_tools: selectAgentTools(state, agentId) ?? undefined,
      agent_custom_tools: selectAgentCustomTools(state, agentId) ?? undefined,
      agent_mcp_servers: selectAgentMcpServers(state, agentId) ?? undefined,
      agent_skill_config: selectAgentSkillConfig(state, agentId) as Record<
        string,
        unknown
      >,
      agent_matrx_actions: selectAgentMatrxActions(state, agentId) as Record<
        string,
        unknown
      >,

      // ── Inputs ─────────────────────────────────────────────────────────
      agent_context_slots: selectAgentContextSlots(state, agentId) ?? undefined,
      agent_variable_definitions:
        selectAgentVariableDefinitions(state, agentId) ?? undefined,

      // ── Governance / lineage ───────────────────────────────────────────
      agent_version: selectAgentVersion(state, agentId) ?? undefined,
      agent_is_version: selectAgentIsVersion(state, agentId),
      agent_parent_agent_id:
        selectAgentParentAgentId(state, agentId) ?? undefined,
      agent_change_note: selectAgentChangeNote(state, agentId) ?? undefined,
      agent_source_id: selectAgentSourceId(state, agentId) ?? undefined,
      agent_is_forked: selectAgentIsForked(state, agentId),
      agent_is_active: selectAgentIsActive(state, agentId),
      agent_is_public: selectAgentIsPublic(state, agentId),
      agent_is_archived: selectAgentIsArchived(state, agentId),
      agent_is_favorite: selectAgentIsFavorite(state, agentId),
      agent_access_level: selectAgentAccessLevel(state, agentId) ?? undefined,
      // `null` = access metadata not fetched yet. Omit rather than lie —
      // the manifest says never infer ownership from its absence.
      agent_is_owner: isOwner ?? undefined,
      agent_is_read_only: selectAgentIsReadOnly(state, agentId),

      // ── Editor state ───────────────────────────────────────────────────
      is_dirty: selectAgentIsDirty(state, agentId),
      dirty_fields: dirtyFields ? Object.keys(dirtyFields) : [],
    });
  }, [store, agentId]);
}

/**
 * Flatten the agent's system message content blocks into the plain
 * instruction text. The canonical text field is `.text` (normalised at the
 * Redux boundary); non-text blocks (files, images) are skipped. Returns
 * undefined when the agent has no system message or no text block.
 */
function extractSystemInstruction(
  systemMessage: { content?: unknown } | undefined,
): string | undefined {
  const blocks = systemMessage?.content;
  if (!Array.isArray(blocks)) return undefined;
  const text = blocks
    .filter(
      (b): b is { type?: string; text?: string } =>
        !!b && typeof b === "object" && (b as { type?: string }).type === "text",
    )
    .map((b) => b.text ?? "")
    .filter(Boolean)
    .join("\n");
  return text.length > 0 ? text : undefined;
}
