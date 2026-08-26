export type ChangeType =
  "added" | "removed" | "modified" | "unchanged" | "reordered";

export type ViewMode = "all" | "changes-only" | "summary" | "raw-json";

export interface DiffNodeMetadata {
  fieldType?: string;
  label?: string;
  resolvedOld?: string;
  resolvedNew?: string;
  summaryText?: string;
}

export interface DiffNode {
  path: string[];
  key: string;
  changeType: ChangeType;
  oldValue: unknown;
  newValue: unknown;
  children?: DiffNode[];
  metadata?: DiffNodeMetadata;
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  total: number;
}

export interface DiffResult {
  root: DiffNode[];
  stats: DiffStats;
  hasChanges: boolean;
}

/** A saved moment attached to one side of a structured comparison. */
export interface DiffChangeMoment {
  /** ISO timestamp rendered in the viewer's local timezone. */
  timestamp: string | null;
  /** Human meaning of the timestamp, such as "Saved" or "Last changed". */
  label: string;
  /** Optional immutable version number that owns this moment. */
  version?: number | null;
}

/** Per-side and per-field dates for a structured comparison. */
export interface DiffTemporalMetadata {
  old?: DiffChangeMoment;
  new?: DiffChangeMoment;
  fields?: Readonly<
    Record<
      string,
      {
        old?: DiffChangeMoment;
        new?: DiffChangeMoment;
      }
    >
  >;
  /** Present while exact field history is still being resolved. */
  loading?: boolean;
  /** Loud, user-facing reason exact field dates could not be resolved. */
  unavailableMessage?: string;
}

export type IdentityKeyFn = (item: unknown, index: number) => string;

export interface DiffOptions {
  excludePaths?: Set<string>;
  identityKeys?: Record<string, string | IdentityKeyFn>;
  maxDepth?: number;
  /**
   * Opt-in presentation filter for consumers whose underscore-prefixed keys
   * are known metadata. Defaults false: structured comparisons must not hide
   * contract keys such as `__kind`.
   */
  skipUnderscorePrefix?: boolean;
}
