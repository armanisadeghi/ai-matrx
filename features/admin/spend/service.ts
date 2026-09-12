// features/admin/spend/service.ts
//
// The ONE read path for platform spend. React → Supabase directly (no Next API
// route in the middle), through two super-admin-gated SECURITY DEFINER RPCs.
//
// WHY RPCs AND NOT TABLE READS: PostgREST aggregates are disabled on this
// project (`PGRST123`, verified 2026-09-12) and `runtime.global_execution`
// carries ~143k rows per 30 days, so "what did today cost" as a client-side
// read is 144 round trips. The sums live in the database — same shape as the
// KG cost console's `fn_kg_cost_*` family. Migration:
// `migrations/spend_dashboard_admin_rpcs.sql`.
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
  SpendOrgRow,
  SpendOverview,
  SpendUserRow,
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

function parseOrg(raw: unknown): SpendOrgRow {
  const o = asRecord(raw);
  return {
    organizationId: strOrNull(o.organization_id),
    name: str(o.name) || "Unattributed",
    costToday: num(o.cost_today),
    cost7d: num(o.cost_7d),
    cost30d: num(o.cost_30d),
    runs30d: num(o.runs_30d),
  };
}

function parseUser(raw: unknown): SpendUserRow {
  const u = asRecord(raw);
  return {
    userId: str(u.user_id),
    email: strOrNull(u.email),
    authType: strOrNull(u.auth_type),
    cost24h: num(u.cost_24h),
    cost6h: num(u.cost_6h),
    requests24h: num(u.requests_24h),
    tokens24h: num(u.tokens_24h),
    blocked: u.blocked === true,
    lastRequestAt: strOrNull(u.last_request_at),
  };
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
 * The whole dashboard in one round trip. Throws on refusal — a super-admin gate
 * that fails must say so, never render an empty page that reads as "$0 spent".
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
    byOrg: arr(payload.by_org).map(parseOrg),
    byUser: arr(payload.by_user).map(parseUser),
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
