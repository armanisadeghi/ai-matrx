/**
 * System-Prompt-mode types.
 *
 * Locked across columns: agent + version + variables + user message +
 * tools + LLM settings. Varied per column: the system prompt text. Each
 * column gets a SYNTHETIC clone of the locked agent (a `cmp-` prefixed
 * AgentDefinition in agentDefinition.agents) so the manual-execute path
 * picks up per-column system-message edits naturally.
 */

export interface SystemPromptColumn {
  columnId: string;
  conversationId: string;
  /**
   * Synthetic agent id (`cmp-<uuid>`) — the per-column clone of the
   * locked agent. Edits the user makes to this column's system prompt
   * are written into agentDefinition.agents[syntheticAgentId].messages.
   */
  syntheticAgentId: string;
  label: string;
  collapsed: boolean;
}

export interface SystemPromptLockedSetup {
  /** Source agent picked at the page level (real DB id). */
  sourceAgentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
}

export interface SystemPromptBattleState {
  locked: SystemPromptLockedSetup;
  /** Cache-only instance that owns the canonical shared Smart Agent Input. */
  inputConversationId: string | null;
  columns: SystemPromptColumn[];
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}
