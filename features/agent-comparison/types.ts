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

/**
 * MasterField — one logical input (the user's master message, or any
 * additional user-defined field) plus a per-column mapping from this
 * field to a specific agent variable name (or "userInput" sentinel for
 * the chat message body).
 *
 * Mapping value semantics:
 *   - "userInput" → the field's text flows into each mapped column's
 *     SmartAgentInput message body.
 *   - any other string → the field's value is written to
 *     `instanceVariableValues.byConversationId[col].userValues[varName]`.
 *   - undefined / missing → field is NOT applied to that column.
 */
export interface MasterFieldMapping {
  [columnId: string]: string | undefined;
}

export interface MasterField {
  fieldId: string;
  /** "master" is the built-in user-message field; others are user-added. */
  kind: "master" | "custom";
  label: string;
  value: string;
  mappings: MasterFieldMapping;
}

export const MASTER_INPUT_TARGET = "__user_input__" as const;

export interface BattleState {
  /** Ordered list of columns. Reorder mutates this. */
  columns: BattleColumn[];
  /** Persisted set id (null = unsaved scratchpad). */
  activeSetId: string | null;
  /** Persisted set name (in-memory copy; updated_at is server-side). */
  activeSetName: string | null;
  /** Async guard for the unified "Submit All" action. */
  isSubmittingAll: boolean;
  /** Centralized mapping fields — master input + user-defined extras. */
  masterFields: MasterField[];
  /**
   * Per-column live mirror of the latest-feedback `rank` for the active
   * request. Lets the rank picker grey out ranks already taken on other
   * columns without every bar fetching every other bar's data on render.
   * Keyed by conversationId. Source of truth is the DB; this is a cache
   * updated by ResponseFeedbackBar on hydrate + save.
   */
  feedbackRanks: Record<string, number>;
  /**
   * Per-column full feedback snapshot (latest request only). Mirrored
   * from the DB by ResponseFeedbackBar. Consumed by the comparison table
   * so it can surface overall + rank + per-metric scores alongside the
   * server-side telemetry.
   */
  feedbackByConversation: Record<string, FeedbackSnapshot>;
  /**
   * Blind-test state. Cross-mode (every comparison mode reads it through
   * the shared selectors) because the masking lives in shared surfaces
   * (ResponseFeedbackBar usage strip, RunsComparisonTable) and a shared
   * BlindColumnHeader. See `shared/blind.ts`.
   */
  blind: BlindState;
}

/**
 * Blind-test session state.
 *
 * Flow: user ticks `enabled` (intent) → clicks Submit All → the toolbar
 * shuffles the columns and dispatches `activateBlind({ order })` which
 * sets `active = true` and stores the shuffled `order`. While
 * `active && !revealed`, every identifying surface masks itself
 * (varied-axis chrome, labels → "Response A/B/C", cost/speed/token
 * metrics). The user evaluates blind, then clicks Reveal → `revealed`
 * flips true and the masks lift. Clearing the comparison resets all of
 * this.
 */
export interface BlindState {
  /** Pre-submit checkbox intent. */
  enabled: boolean;
  /** True once a blind submit has locked in (masking is on). */
  active: boolean;
  /** True once the user has revealed (masking lifts, session stays). */
  revealed: boolean;
  /**
   * Shuffled columnIds — source of truth for both the anonymized
   * "Response A/B/C" labels (by index) and the on-screen order.
   */
  order: string[];
}

export interface FeedbackSnapshot {
  rating: "up" | "down" | null;
  overall: number | null;
  rank: number | null;
  scores: Record<string, number>;
  comment: string | null;
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
