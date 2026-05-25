/**
 * Variations-mode types.
 *
 * The "full builder" comparison mode: start from a TEMPLATE agent and edit
 * everything the Agent Builder exposes — per variation. Locked across
 * variations: only the test input (variables + user message). Varied per
 * variation: the ENTIRE editable agent definition (model, settings, system
 * prompt, seed messages, variables, context slots, tools, MCP).
 *
 * Like System-Prompt / Tools / Tuning modes, each variation owns a
 * SYNTHETIC clone of the template (a `cmp-<uuid>` AgentDefinition record in
 * `agentDefinition.agents`, memory only). The variation's manual instance is
 * keyed to that synthetic id, so the execute-manual-instance thunk reads the
 * live per-variation edits straight from `agentDefinition.agents[syntheticId]`.
 */

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

/**
 * The editable slice of an agent definition that the Builder left panel
 * exposes. Captured per variation when a comparison set is saved, then
 * re-applied to a fresh synthetic on load so a saved comparison rebuilds
 * each variation exactly — without depending on the template being
 * unchanged.
 */
export interface VariationAgentSnapshot {
  modelId: AgentDefinition["modelId"];
  settings: AgentDefinition["settings"];
  messages: AgentDefinition["messages"];
  variableDefinitions: AgentDefinition["variableDefinitions"];
  contextSlots: AgentDefinition["contextSlots"];
  tools: AgentDefinition["tools"];
  customTools: AgentDefinition["customTools"];
  mcpServers: AgentDefinition["mcpServers"];
}

export interface VariationColumn {
  columnId: string;
  conversationId: string;
  /**
   * Synthetic agent id (`cmp-<uuid>`) — the per-variation clone of the
   * template agent. Every Builder edit the user makes for this variation is
   * written into `agentDefinition.agents[syntheticAgentId]`.
   */
  syntheticAgentId: string;
  label: string;
  collapsed: boolean;
}

export interface VariationsLockedSetup {
  /** Template agent picked at the page level (real DB id). */
  sourceAgentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
  /** Test-input variable values, broadcast to every variation on submit. */
  variables: Record<string, unknown>;
  /** Test message, broadcast to every variation on submit. */
  userMessage: string;
}

export interface VariationsBattleState {
  locked: VariationsLockedSetup;
  columns: VariationColumn[];
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}
