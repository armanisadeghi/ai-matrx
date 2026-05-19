/**
 * Tuning-mode types.
 *
 * The "full settings" parallel to the existing Settings mode. Where
 * Settings uses the per-conversation override slice (one model + a
 * narrow set of tunable knobs), Tuning uses the SYNTHETIC AGENT
 * pattern — each column owns a `cmp-<uuid>` clone of the locked
 * source agent and the user opens the same `AgentSettingsModal` the
 * Agent Builder uses, so they get the full, model-aware settings UI
 * (right widgets for the right model — reasoning effort / thinking
 * level / etc.).
 *
 * Locked across columns: source agent, version, variables, user
 * message, system prompt, tools. Varied per column: the model id +
 * everything in the agent's `settings` map.
 *
 * Implementation: `apiEndpointMode: "manual"`. The executor reads the
 * synthetic agent's `.modelId` and `.settings` live for each request.
 */

export interface TuningColumn {
  columnId: string;
  conversationId: string;
  /**
   * Synthetic agent id (`cmp-<uuid>`) — the per-column clone of the
   * locked agent. Edits the user makes through AgentSettingsModal are
   * written into agentDefinition.agents[syntheticAgentId].
   */
  syntheticAgentId: string;
  label: string;
  collapsed: boolean;
}

export interface TuningLockedSetup {
  /** Source agent picked at the page level (real DB id). */
  sourceAgentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
  variables: Record<string, unknown>;
  userMessage: string;
}

export interface TuningBattleState {
  locked: TuningLockedSetup;
  columns: TuningColumn[];
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}
