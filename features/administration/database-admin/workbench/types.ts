export type QueryStatus = "idle" | "running" | "success" | "error";

export interface QueryBlockState {
  id: string;
  label: string;
  query: string;
  status: QueryStatus;
  result: unknown;
  error: string | null;
  executionTime: number | null;
  rowCount: number | null;
  resolvedQuery: string | null;
  ranAt: number | null;
}

export interface Variable {
  id: string;
  name: string;
  value: string;
}

export type JoinMode = "concat" | "inner" | "left" | "embed" | "timeline";

export interface MergeConfig {
  leftBlockId: string | null;
  rightBlockId: string | null;
  leftKey: string | null;
  rightKey: string | null;
  mode: JoinMode;
  timelineKey: string;
}

export interface MergeResultStats {
  mode: JoinMode;
  leftRows: number;
  rightRows: number;
  outputRows: number;
  matchedLeft: number;
  unmatchedLeft: number;
  unmatchedRight: number;
  notes: string[];
}

export interface MergeResult {
  rows: Record<string, unknown>[];
  config: MergeConfig;
  stats: MergeResultStats;
}

export interface WorkbenchPersistedState {
  blocks: Pick<QueryBlockState, "id" | "label" | "query">[];
  variables: Variable[];
  mergeConfig: MergeConfig;
}
