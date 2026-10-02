import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import { createAgentBuilderScope } from "@/features/surfaces/manifests/agent-builder.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/** Placements for agent-builder text fields (target wiring). */
export const AGENT_BUILDER_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.CONTENT_BLOCK,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/** Shared menu props — target state for `/agents/[id]` builder fields. */
export const AGENT_BUILDER_CONTEXT_MENU_PROPS = {
  sourceFeature: "agent-builder" as const,
  surfaceName: "matrx-user/agent-builder" as const,
  isEditable: true as const,
  enabledPlacements: [...AGENT_BUILDER_CONTEXT_MENU_PLACEMENTS],
};

export type AgentBuilderScopeInput = Parameters<
  typeof createAgentBuilderScope
>[0];

export interface BuildAgentBuilderContextDataArgs {
  /** Agent-level snapshot (identity, tools, agent_json, …). */
  agentScope: AgentBuilderScopeInput;
  /** Text in the field being edited (system instruction, description, …). */
  fieldContent: string;
  /** Manifest `focused_field` value for the active input. */
  focusedField: string;
}

/**
 * Canonical `contextData` for `matrx-user/agent-builder`.
 * Matches `SystemMessage` + `useAgentBuilderSurfaceScope` target wiring.
 */
export function buildAgentBuilderContextData(
  args: BuildAgentBuilderContextDataArgs,
): Record<string, unknown> {
  const scope = createAgentBuilderScope({
    ...args.agentScope,
    content: args.fieldContent,
    system_instruction: args.fieldContent,
    focused_field: args.focusedField,
  });
  return scope as Record<string, unknown>;
}

export function agentBuilderScopeToPayload(
  scope: SurfaceScopePayload,
): Record<string, unknown> {
  return scope as Record<string, unknown>;
}
