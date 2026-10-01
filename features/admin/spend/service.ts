// features/admin/spend/service.ts
//
// The ONE read path for platform spend. React → Supabase directly (no Next API
// route in the middle), through three super-admin-gated SECURITY DEFINER RPCs.
//
// WHY RPCs AND NOT TABLE READS: PostgREST aggregates are disabled on this
// project (`PGRST123`, verified 2026-09-12) and `runtime.global_execution`
// carries ~143k rows per 30 days, so "what did today cost" as a client-side
// read is 144 round trips. The sums live in the database — same shape as the
// KG cost console's `fn_kg_cost_*` family. Migrations:
// `migrations/spend_dashboard_admin_rpcs.sql` (overview + headline). The breakdown the Spend
// Explorer read (`public.admin_spend_breakdown`) is no longer read here: its cuts, findings and
// costliest requests are the usage explorer's (/administration/usage, lane DRILL-PRESETS-RETIRE),
// and the RPC stays in the database as their parity oracle.
//
// Doc: features/admin/spend/FEATURE.md

import { createClient } from "@/utils/supabase/client";

import type {
  PrintOrderTotals,
  SpendDayPoint,
  SpendHeadlineSnapshot,
  SpendHeadlineTotals,
  SpendLedger,
  SpendLedgerRole,
  SpendOverview,
} from "./types";

/**
 * The browser's IANA zone. Day boundaries are cut where the person reading the
 * number actually lives, and the surface always says which zone that was.
 */
export function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const LEDGER_ROLES: readonly SpendLedgerRole[] = [
  "primary",
  "overlap",
  "additive",
  "gap",
  "unmeasured",
];

function role(value: unknown): SpendLedgerRole {
  const candidate = str(value);
  return (LEDGER_ROLES as readonly string[]).includes(candidate)
    ? (candidate as SpendLedgerRole)
    : "unmeasured";
}

function parseHeadlineTotals(raw: unknown): SpendHeadlineTotals {
  const h = asRecord(raw);
  return {
    today: num(h.today),
    todayRuns: num(h.today_runs),
    yesterday: num(h.yesterday),
    last7d: num(h.last_7d),
    last30d: num(h.last_30d),
    last24h: num(h.last_24h),
    monthToDate: num(h.month_to_date),
    allTime: num(h.all_time),
    rowsAllTime: num(h.rows_all_time),
    daysElapsed: num(h.days_elapsed),
    daysInMonth: num(h.days_in_month),
    monthProjection: numOrNull(h.month_projection),
  };
}

function parseDay(raw: unknown): SpendDayPoint {
  const d = asRecord(raw);
  return { day: str(d.day), cost: num(d.cost), runs: num(d.runs) };
}

function parseLedger(raw: unknown): SpendLedger {
  const l = asRecord(raw);
  return {
    ledgerKey: str(l.ledger_key),
    label: str(l.label),
    role: role(l.role),
    note: str(l.note),
    tableRef: strOrNull(l.table_ref),
    exists: l.exists === true,
    rows: numOrNull(l.rows),
    lastWrite: strOrNull(l.last_write),
    totalAll: numOrNull(l.total_all),
    totalToday: numOrNull(l.total_today),
    total30d: numOrNull(l.total_30d),
  };
}

function parsePrint(raw: unknown): PrintOrderTotals {
  const p = asRecord(raw);
  return {
    orders: num(p.orders),
    paidOrders: num(p.paid_orders),
    revenueUsd: num(p.revenue_usd),
    refundedUsd: num(p.refunded_usd),
    luluCostUsd: num(p.lulu_cost_usd),
    marginUsd: num(p.margin_usd),
    lastOrderAt: strOrNull(p.last_order_at),
  };
}

/**
 * The headline half of the dashboard in one round trip. Throws on refusal — a
 * super-admin gate that fails must say so, never render an empty page that
 * reads as "$0 spent".
 */
export async function fetchSpendOverview(
  timezone: string = viewerTimezone(),
): Promise<SpendOverview> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_spend_overview", {
    p_tz: timezone,
  });
  if (error) throw error;

  const payload = asRecord(data);
  if (Object.keys(payload).length === 0) {
    throw new Error(
      "admin_spend_overview returned nothing. The numbers below would be a guess, so none are shown.",
    );
  }

  return {
    generatedAt: str(payload.generated_at),
    timezone: str(payload.timezone) || "UTC",
    timezoneRequested: strOrNull(payload.timezone_requested),
    todayStart: str(payload.today_start),
    headline: parseHeadlineTotals(payload.headline),
    byDay: arr(payload.by_day).map(parseDay),
    ledgers: arr(payload.ledgers).map(parseLedger),
    printOrders: parsePrint(payload.print_orders),
  };
}

/** The small, fast payload behind the daily popover. */
export async function fetchSpendHeadline(
  timezone: string = viewerTimezone(),
): Promise<SpendHeadlineSnapshot> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_spend_headline", {
    p_tz: timezone,
  });
  if (error) throw error;

  const payload = asRecord(data);
  if (Object.keys(payload).length === 0) {
    throw new Error("admin_spend_headline returned nothing.");
  }

  const top = asRecord(payload.top_org);
  return {
    generatedAt: str(payload.generated_at),
    timezone: str(payload.timezone) || "UTC",
    todayStart: str(payload.today_start),
    today: num(payload.today),
    todayRuns: num(payload.today_runs),
    yesterday: num(payload.yesterday),
    last7d: num(payload.last_7d),
    monthToDate: num(payload.month_to_date),
    topOrg:
      Object.keys(top).length > 0
        ? {
            organizationId: strOrNull(top.organization_id),
            name: str(top.name) || "Unattributed",
            cost: num(top.cost),
          }
        : null,
    gapCount: num(payload.gap_count),
  };
}

// ---------------------------------------------------------------------------
// ESTIMATED COST — priced by a published rate, never invoiced (2026-09-30).
//
// Some ledger rows carry no billed `cost` but an ESTIMATE in
// `meters.estimated_usd`: compute priced at a published rate (the mandate
// reference patrol's container time at the AWS Fargate list price) while the
// real bill is a hosting invoice. The explorer's totals are `cost` only, so
// without this read those runs showed as $0. They are shown in their own
// labelled block and NEVER added to any invoiced total — adding them would
// count the hosting invoice twice.
//
// A plain table read, not an RPC: the only rows that carry an estimate are a
// handful a day, so the sum is done here. Capped and says so.
// ---------------------------------------------------------------------------

export const ESTIMATED_SPEND_ROW_CAP = 500;

export interface EstimatedSpendRow {
  id: string;
  at: string;
  /** What produced it, e.g. `mandate_reference_patrol_compute`. */
  source: string;
  estimatedUsd: number;
  /** The row's billed `cost` — shown beside the estimate, never merged with it. */
  ledgerCostUsd: number;
  linkKind: string | null;
  linkId: string | null;
}

export interface EstimatedSpend {
  rows: EstimatedSpendRow[];
  totalEstimatedUsd: number;
  /** True when the window held more rows than the read returned. */
  capped: boolean;
}

/** `utility:<feature>:<run id>` → `<feature>`; else the link kind. */
function estimateSource(leaseHolder: unknown, linkKind: unknown): string {
  const holder = str(leaseHolder);
  const parts = holder.split(":");
  if (parts.length >= 2 && parts[1]) return parts[1];
  return str(linkKind) || "unlabelled";
}

export function parseEstimatedSpendRows(raw: unknown): EstimatedSpend {
  const rows: EstimatedSpendRow[] = [];
  for (const item of arr(raw)) {
    const row = asRecord(item);
    const meters = asRecord(row.meters);
    const estimated = numOrNull(meters.estimated_usd);
    if (estimated === null) continue;
    rows.push({
      id: str(row.id),
      at: str(row.created_at),
      source: estimateSource(row.lease_holder, row.link_kind),
      estimatedUsd: estimated,
      ledgerCostUsd: num(row.cost),
      linkKind: strOrNull(row.link_kind),
      linkId: strOrNull(row.link_id),
    });
  }
  return {
    rows,
    totalEstimatedUsd: rows.reduce((sum, r) => sum + r.estimatedUsd, 0),
    capped: rows.length >= ESTIMATED_SPEND_ROW_CAP,
  };
}

export async function fetchEstimatedSpend(args: {
  from: Date;
  to: Date;
  signal?: AbortSignal;
}): Promise<EstimatedSpend> {
  const supabase = createClient();
  let query = supabase
    .schema("runtime")
    .from("global_execution")
    .select("id, created_at, cost, meters, link_kind, link_id, lease_holder")
    .not("meters->>estimated_usd", "is", null)
    .gte("created_at", args.from.toISOString())
    .lt("created_at", args.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(ESTIMATED_SPEND_ROW_CAP);
  if (args.signal) query = query.abortSignal(args.signal);
  const { data, error } = await query;
  if (error) throw error;
  return parseEstimatedSpendRows(data);
}
