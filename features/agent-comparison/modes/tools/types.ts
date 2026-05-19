/**
 * Tools-mode types.
 *
 * Locked across columns: agent + version + variables + user message +
 * system prompt + LLM settings. Varied per column: the tools attached
 * to the agent (built-in tool ids, custom tools, MCP servers). Each
 * column gets a SYNTHETIC clone of the locked agent (a `cmp-` prefixed
 * AgentDefinition in agentDefinition.agents) so the manual-execute path
 * picks up per-column tool edits naturally.
 */

export interface ToolsColumn {
  columnId: string;
  conversationId: string;
  /**
   * Synthetic agent id (`cmp-<uuid>`) — the per-column clone of the
   * locked agent. Edits the user makes to this column's tools list
   * are written into agentDefinition.agents[syntheticAgentId].tools /
   * .customTools / .mcpServers.
   */
  syntheticAgentId: string;
  label: string;
  collapsed: boolean;
}

export interface ToolsLockedSetup {
  /** Source agent picked at the page level (real DB id). */
  sourceAgentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
  variables: Record<string, unknown>;
  userMessage: string;
}

export interface ToolsBattleState {
  locked: ToolsLockedSetup;
  columns: ToolsColumn[];
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}
