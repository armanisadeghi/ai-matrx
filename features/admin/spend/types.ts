// features/admin/spend/types.ts
//
// The shape of what `public.admin_spend_overview` / `admin_spend_headline`
// return. Both are jsonb, so `types/database.types.ts` types them as `Json` —
// these interfaces are the ONE place that jsonb is narrowed, and the narrowing
// is done by a real runtime parse in `service.ts`, never by a cast.
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

export interface SpendOrgRow {
  organizationId: string | null;
  name: string;
  costToday: number;
  cost7d: number;
  cost30d: number;
  runs30d: number;
}

export interface SpendUserRow {
  userId: string;
  email: string | null;
  authType: string | null;
  cost24h: number;
  cost6h: number;
  requests24h: number;
  tokens24h: number;
  blocked: boolean;
  lastRequestAt: string | null;
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
  byOrg: SpendOrgRow[];
  byUser: SpendUserRow[];
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
