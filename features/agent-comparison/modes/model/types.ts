/**
 * Model-mode types.
 *
 * Locked across columns: agent + version + variables + user message +
 * full settings + system prompt + tools. Varied per column: ONLY the
 * model id (via the per-conversation `instanceModelOverrides` slice).
 *
 * Why a dedicated mode (vs just "Settings"): the Python server
 * automatically converts settings between equivalent forms across
 * models, so the user almost never needs to touch settings just to
 * swap a model. A column that says "compare GPT-5 vs Claude 4 Sonnet"
 * shouldn't force them to think about temperature mappings.
 *
 * Implementation: `apiEndpointMode: "agent"`. The executor reads the
 * model override from `state.instanceModelOverrides.byConversationId[id].overrides.model`
 * and routes the call accordingly — no synthetic agent needed.
 */

export interface ModelColumn {
  columnId: string;
  conversationId: string;
  label: string;
  collapsed: boolean;
}

export interface ModelLockedSetup {
  agentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
}

export interface ModelBattleState {
  locked: ModelLockedSetup;
  /**
   * Dedicated cache-only execution instance that owns the canonical shared
   * SmartAgentInput draft. Submit All copies its request state to every column.
   */
  inputConversationId: string | null;
  columns: ModelColumn[];
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}
