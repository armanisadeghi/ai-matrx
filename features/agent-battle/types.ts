/**
 * Agent Battle — types
 *
 * The slice is intentionally tiny: per-column conversation/agent metadata
 * only. Heavy state (variable values, context entries, streaming, messages)
 * already lives in the execution-system slices keyed by conversationId.
 */

export type BattleAgentVersion = "current" | number;

export interface BattleColumn {
  /** Local UUID — stable across resets. Used as the dnd-kit sortable key. */
  columnId: string;
  /** Server-honored conversation id (minted client-side, mirrored server-side). */
  conversationId: string;
  /** Live agent id. Null until the user picks one. */
  agentId: string | null;
  /** Version pointer — "current" or a specific snapshot number. */
  agentVersion: BattleAgentVersion | null;
  /** True when the user collapsed this column's panel to zero width. */
  collapsed: boolean;
}

export interface BattleState {
  /** Ordered list of columns. Reorder mutates this. */
  columns: BattleColumn[];
  /** Persisted set id (null = unsaved scratchpad). */
  activeSetId: string | null;
  /** Persisted set name (in-memory copy; updated_at is server-side). */
  activeSetName: string | null;
  /** Async guard for the unified "Submit All" action. */
  isSubmittingAll: boolean;
}

// =============================================================================
// Persistence shapes (mirror cmp_comparison_sets / cmp_comparison_entries)
// =============================================================================

export interface ComparisonSetRow {
  id: string;
  name: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ComparisonEntryRow {
  id: string;
  comparison_set_id: string;
  conversation_id: string;
  display_order: number;
  agent_id: string;
  agent_version: number | null;
  agent_version_snapshot_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Loaded set bundle returned by the loader. */
export interface LoadedComparisonSet {
  set: ComparisonSetRow;
  entries: ComparisonEntryRow[];
}
