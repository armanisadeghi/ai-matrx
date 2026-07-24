// lib/content-cleanup/value-types.ts
//
// Pure, framework-agnostic types for the VALUE cleanup engine — the scalar
// sibling of `types.ts`. No React, Redux, DOM, or Supabase dependencies.
//
// Where the document engine protects structured regions and edits the prose
// around them, this engine treats each value as one indivisible scalar and
// asks a different question: "is this whole value wrapped in markup that does
// not belong in a cell?" See `value-operations.ts` for the reasoning.
//
// Consumers: user data tables today (`/data/[id]`); any grid, imported CSV,
// scraped record set, or agent-written record store tomorrow. The engine knows
// nothing about where the cells came from — a consumer hands it rows and gets
// back a report plus the exact patches to write.

export type ValueCleanupOperationId =
  | "normalize-line-endings"
  | "remove-invisibles"
  | "normalize-unicode-whitespace"
  | "decode-html"
  | "unwrap-code-ticks"
  | "unwrap-bold"
  | "unwrap-italic"
  | "unwrap-quotes"
  | "strip-list-marker"
  | "strip-heading-marker"
  | "normalize-quotes"
  | "collapse-spaces"
  | "collapse-blank-lines"
  | "trim-edges"
  | "blank-to-empty";

export type ValueCleanupOperationGroup = "recommended" | "extra";

export interface ValueCleanupOperationMeta {
  id: ValueCleanupOperationId;
  label: string;
  /** One-line description shown next to the toggle. */
  description: string;
  defaultEnabled: boolean;
  group: ValueCleanupOperationGroup;
}

export interface ValueCleanupOperationDef extends ValueCleanupOperationMeta {
  /** Plain-language, past-tense phrase for the review cards (no jargon). */
  human: string;
  /**
   * Transform a whole value. Return the new value, or `null` when the
   * operation does not apply — `null` is how an op declines (e.g. the
   * backticks it found were interior, not wrapping), and is never the same
   * thing as returning an empty string.
   */
  run(value: string): string | null;
}

/** Result of running the enabled ops over one value. */
export interface ValueCleanupResult {
  before: string;
  after: string;
  changed: boolean;
  /** Ids of the ops that actually changed something, in run order. */
  appliedOps: ValueCleanupOperationId[];
}

/** One cell the scan would rewrite. */
export interface CellChange {
  rowId: string;
  /** Machine field name — the key inside the row's data object. */
  fieldName: string;
  /** Human column label, for the review UI. */
  fieldLabel: string;
  before: string;
  after: string;
  appliedOps: ValueCleanupOperationId[];
}

/** Per-operation tally across the whole scan. */
export interface ValueOperationOutcome {
  id: ValueCleanupOperationId;
  label: string;
  human: string;
  enabled: boolean;
  /** Number of CELLS this op changed (0 when it was a no-op). */
  changes: number;
}

export interface CellsCleanupStats {
  /** Cells inspected (string-valued cells across the scanned rows). */
  cellsScanned: number;
  cellsChanged: number;
  rowsChanged: number;
  charsBefore: number;
  charsAfter: number;
}

export interface CellsCleanupReport {
  changed: boolean;
  changes: CellChange[];
  operations: ValueOperationOutcome[];
  stats: CellsCleanupStats;
}

/** One row's worth of patch — only the fields that actually changed. */
export interface RowPatch {
  rowId: string;
  data: Record<string, string>;
}

/** A row as the engine needs to see it. Deliberately minimal. */
export interface CleanableRow {
  id: string;
  data: Record<string, unknown>;
}

/** A column as the engine needs to see it. Deliberately minimal. */
export interface CleanableField {
  fieldName: string;
  label: string;
}
