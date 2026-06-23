// lib/content-cleanup/types.ts
//
// Pure, framework-agnostic types for the content cleanup engine. No React,
// Redux, or DOM dependencies. The engine protects structured content (code,
// JSON, tables, …) by detection, runs opt-in whitespace/typography operations
// ONLY on the unprotected ("cleanable") text, and returns a fully transparent
// report of everything it did — protected regions, per-operation change
// counts, and the before/after content. Consumers (notes today; transcripts,
// rich-document, and any paste-cleanup surface tomorrow) reuse this engine and
// render the report however they like.

export type ProtectedKind =
  | "front-matter"
  | "fenced-code"
  | "inline-code"
  | "json-block"
  | "table"
  | "html-block";

/** "certain" = enclosed by unambiguous markdown / parses as JSON.
 *  "likely"  = heuristic match the user should glance at. */
export type ProtectionConfidence = "certain" | "likely";

export interface ProtectedRegion {
  /** Char offset in the original content (inclusive). */
  start: number;
  /** Char offset in the original content (exclusive). */
  end: number;
  kind: ProtectedKind;
  confidence: ProtectionConfidence;
  /** Human-readable explanation of why this is protected. */
  reason: string;
  /** Short single-line preview of the protected text. */
  preview: string;
  /** Number of source lines the region spans. */
  lineCount: number;
}

export type CleanupOperationId =
  | "normalize-line-endings"
  | "remove-invisibles"
  | "normalize-unicode-whitespace"
  | "normalize-quotes"
  | "normalize-bullets"
  | "collapse-spaces"
  | "trim-trailing-whitespace"
  | "collapse-blank-lines"
  | "trim-document-edges";

export type CleanupOperationGroup = "recommended" | "extra";

export interface CleanupOperationMeta {
  id: CleanupOperationId;
  label: string;
  /** One-line description shown next to the toggle. */
  description: string;
  defaultEnabled: boolean;
  group: CleanupOperationGroup;
}

/** Result of running a single operation over a (masked) string. */
export interface OperationRunResult {
  text: string;
  /** Number of discrete edits the op made (0 when it was a no-op). */
  changes: number;
}

/** Per-operation outcome recorded in the report (run order preserved). */
export interface OperationOutcome {
  id: CleanupOperationId;
  label: string;
  enabled: boolean;
  changes: number;
}

export interface CleanupStats {
  charsBefore: number;
  charsAfter: number;
  /** Total chars sitting inside protected regions (never touched). */
  protectedChars: number;
  /** Total chars eligible for cleanup. */
  cleanableChars: number;
  protectedRegions: number;
  /** Sum of all per-operation change counts. */
  totalChanges: number;
}

export interface CleanupReport {
  original: string;
  cleaned: string;
  /** True when `cleaned !== original`. */
  changed: boolean;
  protectedRegions: ProtectedRegion[];
  operations: OperationOutcome[];
  stats: CleanupStats;
}
