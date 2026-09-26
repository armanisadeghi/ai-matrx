/**
 * Request-Modification-mode types.
 *
 * Locked across columns: agent + version. Varied per column: the
 * variables + user message (and any other input-time tweaks the user
 * applies via the per-column SmartAgentInput). The simplest mode —
 * no synthetic agents, no per-column overrides; every column runs
 * the SAME locked agent against DIFFERENT user-supplied inputs.
 *
 * Use cases: A/B testing how the same agent handles different
 * phrasings of the same request; running the same agent over a
 * batch of distinct cases side-by-side; demoing an agent's range.
 */

/**
 * The request a column last sent (or was saved with). The column's composer
 * empties the moment it sends, so the saved battle keeps THIS, never the
 * emptied composer.
 */
export interface RequestModColumnRequest {
  user_message: string;
  variables: Record<string, unknown>;
}

export interface RequestModColumn {
  columnId: string;
  conversationId: string;
  label: string;
  collapsed: boolean;
  lastRequest?: RequestModColumnRequest | null;
}

export interface RequestModLockedSetup {
  agentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
}

export interface RequestModBattleState {
  locked: RequestModLockedSetup;
  columns: RequestModColumn[];
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}
