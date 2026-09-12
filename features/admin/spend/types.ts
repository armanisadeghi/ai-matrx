// features/admin/spend/types.ts
//
// The shape of what `public.admin_spend_overview`, `admin_spend_headline` and
// `admin_spend_breakdown` return. All three are jsonb, so
// `types/database.types.ts` types them as `Json` — these interfaces are the
// ONE place that jsonb is narrowed, and the narrowing is done by a real runtime
// parse in `service.ts`, never by a cast.
//
// Doc: features/admin/spend/FEATURE.md

/** Roles a cost ledger can play. Declared once in `_spend_ledger_registry()`. */
export type SpendLedgerRole =
  /** The headline. `runtime.global_execution` and nothing else. */
  | "primary"
  /** Real spend, but the same money seen through another lens. Never added. */
  | "overlap"
  /** Genuinely separate spend. */
  | "additive"
  /** A ledger that exists and writes nothing (or nothing but zeros). */
  | "gap"
  /** Money we know we spend with no row anywhere to prove it. */
  | "unmeasured";

export interface SpendLedger {
  ledgerKey: string;
  label: string;
  role: SpendLedgerRole;
  note: string;
  /** `schema.table`, or null for an unmeasured source with no table at all. */
  tableRef: string | null;
  exists: boolean;
  rows: number | null;
  lastWrite: string | null;
  totalAll: number | null;
  totalToday: number | null;
  total30d: number | null;
}

export interface SpendHeadlineTotals {
  today: number;
  todayRuns: number;
  yesterday: number;
  last7d: number;
  last30d: number;
  last24h: number;
  monthToDate: number;
  allTime: number;
  rowsAllTime: number;
  daysElapsed: number;
  daysInMonth: number;
  /** Month-to-date extrapolated over the whole month. Null on day one. */
  monthProjection: number | null;
}

export interface SpendDayPoint {
  day: string;
  cost: number;
  runs: number;
}

export interface PrintOrderTotals {
  orders: number;
  paidOrders: number;
  revenueUsd: number;
  refundedUsd: number;
  luluCostUsd: number;
  marginUsd: number;
  lastOrderAt: string | null;
}

export interface SpendOverview {
  generatedAt: string;
  /** The zone the day boundaries were actually cut in. */
  timezone: string;
  /** What the browser asked for — differs from `timezone` only on a fallback. */
  timezoneRequested: string | null;
  todayStart: string;
  headline: SpendHeadlineTotals;
  byDay: SpendDayPoint[];
  ledgers: SpendLedger[];
  printOrders: PrintOrderTotals;
}

/** The small payload behind the daily popover. */
export interface SpendHeadlineSnapshot {
  generatedAt: string;
  timezone: string;
  todayStart: string;
  today: number;
  todayRuns: number;
  yesterday: number;
  last7d: number;
  monthToDate: number;
  topOrg: { organizationId: string | null; name: string; cost: number } | null;
  gapCount: number;
}

// ── The breakdown (admin_spend_breakdown) ────────────────────────────────────

/**
 * The dimensions the ledger can be cut by. The string values are the filter
 * keys the RPC accepts — `p_filters` is `{ [SpendDimension]: key }`.
 */
export type SpendDimension =
  | "organization"
  | "user"
  | "agent"
  | "app"
  | "feature"
  | "origin"
  | "trigger"
  | "source"
  | "model"
  | "conversation"
  | "day";

export const SPEND_DIMENSIONS: readonly SpendDimension[] = [
  "organization",
  "user",
  "agent",
  "feature",
  "conversation",
  "model",
  "trigger",
  "origin",
  "app",
  "source",
  "day",
];

/** Active drill-down filters: dimension → the row key that was clicked. */
export type SpendFilters = Partial<Record<SpendDimension, string>>;

/** The literal the RPC uses for "this row has no value for the dimension". */
export const SPEND_NONE_KEY = "(none)";

export interface SpendDimensionRow {
  /** The filter value. `SPEND_NONE_KEY` when the ledger row has no value. */
  key: string;
  label: string;
  cost: number;
  /** cost ÷ the filtered window's total. 0 when the total is 0. */
  share: number;
  /** Ledger executions. */
  n: number;
  /** Distinct chat requests (0 for rows no request explains). */
  requests: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  manualCost: number;
  automatedCost: number;
  lastAt: string | null;
}

export interface SpendDimensionBreakdown {
  rows: SpendDimensionRow[];
  /** Everything past the RPC's row cap, summed. */
  otherCost: number;
  otherN: number;
  /** How many distinct values exist, capped rows included. */
  distinct: number;
}

export interface SpendTotals {
  cost: number;
  executions: number;
  paidExecutions: number;
  requests: number;
  conversations: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  manualCost: number;
  automatedCost: number;
  /** Cost the chat request ledger explains (app / feature / model known). */
  linkedCost: number;
  /** Cost attributed from the execution's own context only. */
  unlinkedCost: number;
  /** The WHOLE ledger in the window, before filters. */
  ledgerCost: number;
  ledgerRows: number;
  hours: number;
}

export interface SpendSeriesPoint {
  /** `YYYY-MM-DD` for days, `YYYY-MM-DDTHH:00` for hours. Local to the zone. */
  at: string;
  cost: number;
  manual: number;
  automated: number;
  n: number;
}

export interface SpendFailedRow {
  requestId: string;
  cost: number;
  status: string | null;
  finishReason: string | null;
  feature: string | null;
  agent: string | null;
  user: string | null;
  conversationId: string | null;
  conversation: string | null;
  at: string;
}

export interface SpendContextHeavyRow {
  conversationId: string;
  conversation: string | null;
  cost: number;
  requests: number;
  calls: number;
  avgContext: number;
  user: string | null;
  agent: string | null;
  feature: string | null;
}

export interface SpendIterationHeavyRow {
  requestId: string;
  cost: number;
  iterations: number;
  toolCalls: number;
  feature: string | null;
  agent: string | null;
  user: string | null;
  conversationId: string | null;
  conversation: string | null;
  at: string;
}

export interface SpendHogRow {
  conversationId: string;
  conversation: string | null;
  cost: number;
  share: number;
  requests: number;
  user: string | null;
  agent: string | null;
  feature: string | null;
  trigger: string | null;
  firstAt: string;
  lastAt: string;
}

export interface SpendSpikeRow {
  hour: string;
  cost: number;
  n: number;
  multiple: number | null;
  topFeature: string | null;
  topUser: string | null;
}

export interface SpendBurstRow {
  bucket: string;
  user: string | null;
  agent: string | null;
  feature: string | null;
  trigger: string | null;
  requests: number;
  cost: number;
}

export interface SpendSignals {
  failedSpend: { cost: number; n: number; rows: SpendFailedRow[] };
  contextHeavy: {
    cost: number;
    n: number;
    threshold: number;
    rows: SpendContextHeavyRow[];
  };
  iterationHeavy: {
    cost: number;
    n: number;
    threshold: number;
    rows: SpendIterationHeavyRow[];
  };
  conversationHogs: {
    cost: number;
    n: number;
    threshold: number;
    rows: SpendHogRow[];
  };
  spikeHours: {
    cost: number;
    n: number;
    medianHour: number;
    threshold: number;
    rows: SpendSpikeRow[];
  };
  repeatBursts: { cost: number; n: number; threshold: number; rows: SpendBurstRow[] };
  unpriced: { n: number; requests: number };
}

export interface SpendRequestRow {
  requestId: string | null;
  executionId: string;
  at: string;
  cost: number;
  share: number;
  organizationId: string | null;
  organization: string;
  userId: string | null;
  user: string | null;
  agentId: string | null;
  agent: string | null;
  app: string;
  feature: string;
  origin: string;
  trigger: "manual" | "automated";
  source: string;
  model: string | null;
  provider: string | null;
  conversationId: string | null;
  conversation: string | null;
  status: string | null;
  finishReason: string | null;
  iterations: number;
  toolCalls: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
}

export interface SpendBreakdown {
  generatedAt: string;
  timezone: string;
  timezoneRequested: string | null;
  window: { from: string; to: string; hours: number };
  filters: SpendFilters;
  totals: SpendTotals;
  dimensions: Record<SpendDimension, SpendDimensionBreakdown>;
  series: { day: SpendSeriesPoint[]; hour: SpendSeriesPoint[] | null };
  signals: SpendSignals;
  topRequests: SpendRequestRow[];
}

/** The five `platform.spend_explorer.*` knobs, passed to the RPC as thresholds. */
export interface SpendExplorerThresholds {
  contextHeavyTokens: number;
  iterationHeavy: number;
  spikeMultiplier: number;
  hogSharePct: number;
  repeatBurst: number;
}
