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
// `migrations/spend_dashboard_admin_rpcs.sql` (overview + headline) and
// `migrations/spend_explorer_admin_rpc.sql` (the breakdown).
//
// Doc: features/admin/spend/FEATURE.md

import { createClient } from "@/utils/supabase/client";

import type {
  PrintOrderTotals,
  SpendBreakdown,
  SpendBurstRow,
  SpendContextHeavyRow,
  SpendDayPoint,
  SpendDimension,
  SpendDimensionBreakdown,
  SpendDimensionRow,
  SpendExplorerThresholds,
  SpendFailedRow,
  SpendFilters,
  SpendHeadlineSnapshot,
  SpendHeadlineTotals,
  SpendHogRow,
  SpendIterationHeavyRow,
  SpendLedger,
  SpendLedgerRole,
  SpendOverview,
  SpendRequestRow,
  SpendSeriesPoint,
  SpendSignals,
  SpendSpikeRow,
  SpendTotals,
} from "./types";
import { SPEND_DIMENSIONS } from "./types";

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

// ── The breakdown ─────────────────────────────────────────────────────────────

function parseDimensionRow(raw: unknown): SpendDimensionRow {
  const r = asRecord(raw);
  return {
    key: str(r.key),
    label: str(r.label),
    cost: num(r.cost),
    share: num(r.share),
    n: num(r.n),
    requests: num(r.requests),
    tokensIn: num(r.tokens_in),
    tokensCached: num(r.tokens_cached),
    tokensOut: num(r.tokens_out),
    manualCost: num(r.manual_cost),
    automatedCost: num(r.automated_cost),
    lastAt: strOrNull(r.last_at),
  };
}

function parseDimension(raw: unknown): SpendDimensionBreakdown {
  const d = asRecord(raw);
  return {
    rows: arr(d.rows).map(parseDimensionRow),
    otherCost: num(d.other_cost),
    otherN: num(d.other_n),
    distinct: num(d.distinct),
  };
}

function parseTotals(raw: unknown): SpendTotals {
  const t = asRecord(raw);
  return {
    cost: num(t.cost),
    executions: num(t.executions),
    paidExecutions: num(t.paid_executions),
    requests: num(t.requests),
    conversations: num(t.conversations),
    tokensIn: num(t.tokens_in),
    tokensCached: num(t.tokens_cached),
    tokensOut: num(t.tokens_out),
    manualCost: num(t.manual_cost),
    automatedCost: num(t.automated_cost),
    linkedCost: num(t.linked_cost),
    unlinkedCost: num(t.unlinked_cost),
    ledgerCost: num(t.ledger_cost),
    ledgerRows: num(t.ledger_rows),
    hours: num(t.hours),
  };
}

function parseSeriesPoint(raw: unknown, key: "day" | "hour"): SpendSeriesPoint {
  const p = asRecord(raw);
  return {
    at: str(p[key]),
    cost: num(p.cost),
    manual: num(p.manual),
    automated: num(p.automated),
    n: num(p.n),
  };
}

function parseFailed(raw: unknown): SpendFailedRow {
  const r = asRecord(raw);
  return {
    requestId: str(r.request_id),
    cost: num(r.cost),
    status: strOrNull(r.status),
    finishReason: strOrNull(r.finish_reason),
    feature: strOrNull(r.feature),
    agent: strOrNull(r.agent),
    user: strOrNull(r.user),
    conversationId: strOrNull(r.conversation_id),
    conversation: strOrNull(r.conversation),
    at: str(r.at),
  };
}

function parseContextHeavy(raw: unknown): SpendContextHeavyRow {
  const r = asRecord(raw);
  return {
    conversationId: str(r.conversation_id),
    conversation: strOrNull(r.conversation),
    cost: num(r.cost),
    requests: num(r.requests),
    calls: num(r.calls),
    avgContext: num(r.avg_context),
    user: strOrNull(r.user),
    agent: strOrNull(r.agent),
    feature: strOrNull(r.feature),
  };
}

function parseIterationHeavy(raw: unknown): SpendIterationHeavyRow {
  const r = asRecord(raw);
  return {
    requestId: str(r.request_id),
    cost: num(r.cost),
    iterations: num(r.iterations),
    toolCalls: num(r.tool_calls),
    feature: strOrNull(r.feature),
    agent: strOrNull(r.agent),
    user: strOrNull(r.user),
    conversationId: strOrNull(r.conversation_id),
    conversation: strOrNull(r.conversation),
    at: str(r.at),
  };
}

function parseHog(raw: unknown): SpendHogRow {
  const r = asRecord(raw);
  return {
    conversationId: str(r.conversation_id),
    conversation: strOrNull(r.conversation),
    cost: num(r.cost),
    share: num(r.share),
    requests: num(r.requests),
    user: strOrNull(r.user),
    agent: strOrNull(r.agent),
    feature: strOrNull(r.feature),
    trigger: strOrNull(r.trigger),
    firstAt: str(r.first_at),
    lastAt: str(r.last_at),
  };
}

function parseSpike(raw: unknown): SpendSpikeRow {
  const r = asRecord(raw);
  return {
    hour: str(r.hour),
    cost: num(r.cost),
    n: num(r.n),
    multiple: numOrNull(r.multiple),
    topFeature: strOrNull(r.top_feature),
    topUser: strOrNull(r.top_user),
  };
}

function parseBurst(raw: unknown): SpendBurstRow {
  const r = asRecord(raw);
  return {
    bucket: str(r.bucket),
    user: strOrNull(r.user),
    agent: strOrNull(r.agent),
    feature: strOrNull(r.feature),
    trigger: strOrNull(r.trigger),
    requests: num(r.requests),
    cost: num(r.cost),
  };
}

function parseSignals(raw: unknown): SpendSignals {
  const s = asRecord(raw);
  const failed = asRecord(s.failed_spend);
  const context = asRecord(s.context_heavy);
  const iteration = asRecord(s.iteration_heavy);
  const hogs = asRecord(s.conversation_hogs);
  const spikes = asRecord(s.spike_hours);
  const bursts = asRecord(s.repeat_bursts);
  const unpriced = asRecord(s.unpriced);
  return {
    failedSpend: {
      cost: num(failed.cost),
      n: num(failed.n),
      rows: arr(failed.rows).map(parseFailed),
    },
    contextHeavy: {
      cost: num(context.cost),
      n: num(context.n),
      threshold: num(context.threshold),
      rows: arr(context.rows).map(parseContextHeavy),
    },
    iterationHeavy: {
      cost: num(iteration.cost),
      n: num(iteration.n),
      threshold: num(iteration.threshold),
      rows: arr(iteration.rows).map(parseIterationHeavy),
    },
    conversationHogs: {
      cost: num(hogs.cost),
      n: num(hogs.n),
      threshold: num(hogs.threshold),
      rows: arr(hogs.rows).map(parseHog),
    },
    spikeHours: {
      cost: num(spikes.cost),
      n: num(spikes.n),
      medianHour: num(spikes.median_hour),
      threshold: num(spikes.threshold),
      rows: arr(spikes.rows).map(parseSpike),
    },
    repeatBursts: {
      cost: num(bursts.cost),
      n: num(bursts.n),
      threshold: num(bursts.threshold),
      rows: arr(bursts.rows).map(parseBurst),
    },
    unpriced: { n: num(unpriced.n), requests: num(unpriced.requests) },
  };
}

function parseRequest(raw: unknown): SpendRequestRow {
  const r = asRecord(raw);
  return {
    requestId: strOrNull(r.request_id),
    executionId: str(r.execution_id),
    at: str(r.at),
    cost: num(r.cost),
    share: num(r.share),
    organizationId: strOrNull(r.organization_id),
    organization: str(r.organization) || "Unattributed",
    userId: strOrNull(r.user_id),
    user: strOrNull(r.user),
    agentId: strOrNull(r.agent_id),
    agent: strOrNull(r.agent),
    app: str(r.app),
    feature: str(r.feature),
    origin: str(r.origin),
    trigger: str(r.trigger) === "manual" ? "manual" : "automated",
    source: str(r.source),
    model: strOrNull(r.model),
    provider: strOrNull(r.provider),
    conversationId: strOrNull(r.conversation_id),
    conversation: strOrNull(r.conversation),
    status: strOrNull(r.status),
    finishReason: strOrNull(r.finish_reason),
    iterations: num(r.iterations),
    toolCalls: num(r.tool_calls),
    tokensIn: num(r.tokens_in),
    tokensCached: num(r.tokens_cached),
    tokensOut: num(r.tokens_out),
  };
}

function parseFilters(raw: unknown): SpendFilters {
  const f = asRecord(raw);
  const out: SpendFilters = {};
  for (const dim of SPEND_DIMENSIONS) {
    const v = strOrNull(f[dim]);
    if (v) out[dim] = v;
  }
  return out;
}

export interface SpendBreakdownArgs {
  from: Date;
  to: Date;
  timezone?: string;
  filters?: SpendFilters;
  thresholds: SpendExplorerThresholds;
}

/**
 * The ledger for any window, cut by every dimension. Throws on refusal, on a
 * bad window, and on an empty payload — never an empty explorer that reads as
 * "$0 spent".
 */
export async function fetchSpendBreakdown(
  args: SpendBreakdownArgs,
): Promise<SpendBreakdown> {
  const supabase = createClient();
  const filters: Record<string, string> = {};
  for (const dim of SPEND_DIMENSIONS) {
    const v = args.filters?.[dim];
    if (v) filters[dim] = v;
  }
  const { data, error } = await supabase.rpc("admin_spend_breakdown", {
    p_from: args.from.toISOString(),
    p_to: args.to.toISOString(),
    p_tz: args.timezone ?? viewerTimezone(),
    p_filters: filters,
    p_thresholds: {
      context_heavy_tokens: args.thresholds.contextHeavyTokens,
      iteration_heavy: args.thresholds.iterationHeavy,
      spike_multiplier: args.thresholds.spikeMultiplier,
      hog_share_pct: args.thresholds.hogSharePct,
      repeat_burst: args.thresholds.repeatBurst,
    },
  });
  if (error) throw error;

  const payload = asRecord(data);
  if (Object.keys(payload).length === 0) {
    throw new Error(
      "admin_spend_breakdown returned nothing. The breakdown would be a guess, so none is shown.",
    );
  }

  const rawDims = asRecord(payload.dimensions);
  const dimensions = {} as Record<SpendDimension, SpendDimensionBreakdown>;
  for (const dim of SPEND_DIMENSIONS) {
    dimensions[dim] = parseDimension(rawDims[dim]);
  }

  const series = asRecord(payload.series);
  const window = asRecord(payload.window);

  return {
    generatedAt: str(payload.generated_at),
    timezone: str(payload.timezone) || "UTC",
    timezoneRequested: strOrNull(payload.timezone_requested),
    window: { from: str(window.from), to: str(window.to), hours: num(window.hours) },
    filters: parseFilters(payload.filters),
    totals: parseTotals(payload.totals),
    dimensions,
    series: {
      day: arr(series.day).map((p) => parseSeriesPoint(p, "day")),
      hour: Array.isArray(series.hour)
        ? series.hour.map((p) => parseSeriesPoint(p, "hour"))
        : null,
    },
    signals: parseSignals(payload.signals),
    topRequests: arr(payload.top_requests).map(parseRequest),
  };
}
