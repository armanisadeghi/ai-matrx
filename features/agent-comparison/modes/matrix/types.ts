/**
 * Matrix Battle — the shapes of the contract both lanes build to.
 *
 * The battle IS its `cmp_comparison_sets` row (`metadata.mode = "matrix"`,
 * `metadata.matrix` = the frozen setup below). Every cell IS one
 * `cmp_comparison_entries` row, created and written by the SERVER — the client
 * only reads cells and never writes them.
 */

export interface MatrixSettings {
  temperature?: number;
  max_output_tokens?: number;
  reasoning_effort?: string;
  [key: string]: unknown;
}

/** Every key optional; a key PRESENT overrides the layer below (null clears). */
export interface MatrixPatch {
  agent_id?: string;
  agent_version_id?: string | null;
  agent_version_number?: number | null;
  surface?: string | null;
  auto_tools?: boolean | null;
  tools_add?: string[];
  tools_remove?: string[];
  model_id?: string | null;
  settings?: MatrixSettings;
  user_input?: string;
  variables?: Record<string, string>;
}

export interface MatrixVariant {
  id: string;
  label: string;
  patch: MatrixPatch;
}

export interface MatrixAxis {
  label: string;
  variants: MatrixVariant[];
}

export interface MatrixSetup {
  schema_version: 1;
  base: MatrixPatch;
  rows: MatrixAxis;
  columns: MatrixAxis;
  repeats: number;
}

export type MatrixAxisKey = "rows" | "columns";

export type MatrixCellStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface MatrixToolUse {
  name: string;
  count: number;
}

export interface MatrixCellResult {
  user_request_id?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  total_tokens?: number;
  cost?: number;
  tool_calls?: number;
  tools_used?: MatrixToolUse[];
  iterations?: number;
  llm_calls?: number;
  duration_ms?: number;
  ttft_ms?: number;
  finish_reason?: string;
  answer?: string;
}

/** One cell, read from its entry row. */
export interface MatrixCell {
  entryId: string;
  conversationId: string;
  rowId: string;
  columnId: string;
  repeat: number;
  status: MatrixCellStatus;
  /** A running cell whose heartbeat is older than the lease. */
  stalled: boolean;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  request: MatrixPatch | null;
  result: MatrixCellResult | null;
}

export interface MatrixBattleState {
  setup: MatrixSetup;
  activeSetId: string | null;
  activeSetName: string | null;
  /** The setup differs from what was last saved. */
  dirty: boolean;
  cells: MatrixCell[];
  /** A run / cancel request is in flight from this tab. */
  runInFlight: boolean;
  /** The last run or cancel call's error, exactly as the server said it. */
  runError: string | null;
  /** The last cell read's error. */
  readError: string | null;
}
