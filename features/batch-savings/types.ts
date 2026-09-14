// features/batch-savings/types.ts
//
// The narrowed shape of `batch.savings_summary` — THE one batch savings
// computation (aidream migration 0679). Every surface that shows batch spend or
// savings reads this, and nothing computes its own flavour.
//
// Doc: features/batch-savings/FEATURE.md

export interface BatchSavingsRow {
  key: string;
  label: string;
  sublabel: string | null;
  items: number;
  /** What the provider billed. */
  actualUsd: number;
  /** The same actual tokens at the same model's live catalog rate. */
  liveEquivalentUsd: number;
  savedUsd: number;
  discountPct: number | null;
}

/** The window's whole spend ledger split by lane (runtime.global_execution). */
export interface BatchLaneSplit {
  ledgerUsd: number;
  ledgerExecutions: number;
  batchUsd: number;
  batchExecutions: number;
  escalatedUsd: number;
  escalatedExecutions: number;
  liveUsd: number;
}

export interface BatchSavingsSummary {
  generatedAt: string;
  from: string | null;
  to: string | null;
  organizationId: string | null;
  /** Completed items with both a bill and a live-equivalent — what the saving covers. */
  items: number;
  batchItems: number;
  escalatedItems: number;
  completedItems: number;
  /** Completed items with tokens but no price — excluded from every sum, and said so. */
  unpricedItems: number;
  actualUsd: number;
  liveEquivalentUsd: number;
  savedUsd: number;
  discountPct: number | null;
  batchActualUsd: number;
  escalatedActualUsd: number;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  undeliveredItems: number;
  undeliveredUsd: number;
  /** The PRE-SUBMISSION ESTIMATE for the same items. Never a saving basis; shown only labelled. */
  preSubmissionEstimateUsd: number;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
  byPurpose: BatchSavingsRow[];
  byModel: BatchSavingsRow[];
  byOrganization: BatchSavingsRow[];
  lanes: BatchLaneSplit;
}
