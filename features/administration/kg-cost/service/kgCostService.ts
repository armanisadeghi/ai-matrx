/**
 * features/administration/kg-cost/service/kgCostService.ts
 *
 * Direct-to-Supabase client for the read-only KG-cost dashboard.
 * `public.fn_kg_cost_summary` / `_org_detail` /
 * `_pending_batches` / `_batch_detail` mirror the retired
 * `aidream/api/routers/kg_cost.py` endpoints exactly — admin-gated INSIDE
 * each function (public.is_super_admin()), identity from auth.uid() only.
 */
import { makeAssertData } from "@/utils/errors";
import { createClient } from "@/utils/supabase/client";
import { dateFilterBounds } from "@ai-matrx/design-system/data-table";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

const assertData = makeAssertData("load the knowledge-graph cost data");

// ---------------------------------------------------------------------------
// Wire types — same field names the retired FastAPI models used
// ---------------------------------------------------------------------------

export type BatchStatus = string;
export type BatchProvider = string;
export type BatchKind = string;

export interface KgCostSummaryResponse {
  spend_today_usd: number;
  spend_7d_usd: number;
  orgs_over_80pct: number;
  pending_batches: number;
  ner_coverage_pct: number;
  /** Batch saving, last 7 days, from `batch.savings_summary`: actual tokens at the live rate minus the bill. */
  batch_savings_7d_usd?: number;
  batch_savings_7d_items?: number;
  batch_savings_7d_discount_pct?: number | null;
}

export interface OrgCostRow {
  organization_id: string;
  organization_name: string | null;
  daily_auto_rag_budget_usd: number;
  daily_auto_rag_cost_used_usd: number;
  daily_auto_rag_window_start: string | null;
  percent_used: number;
  last_charge_at: string | null;
}

export interface OrgCostListResponse {
  items: OrgCostRow[];
  total: number;
}

export interface DailySpendPoint {
  date: string;
  cost_usd: number;
}

export interface TopSourceRow {
  source: string;
  cost_usd: number;
  count: number;
}

export interface BatchSummaryByStatus {
  status: string;
  count: number;
  total_cost_usd: number;
}

export interface OrgCostDetailResponse {
  organization_id: string;
  organization_name: string | null;
  budget_usd: number;
  used_today_usd: number;
  window_start: string | null;
  daily_series: DailySpendPoint[];
  top_sources: TopSourceRow[];
  batch_summary: BatchSummaryByStatus[];
}

export interface BatchRow {
  id: string;
  custom_id: string | null;
  provider: string;
  batch_id: string | null;
  kind: string;
  created_by: string | null;
  organization_id: string | null;
  organization_name: string | null;
  source_kind: string | null;
  source_id: string | null;
  status: string;
  est_cost_usd: number;
  poll_count: number;
  submitted_at: string;
  last_polled_at: string | null;
  next_poll_at: string | null;
}

export interface PendingBatchListResponse {
  items: BatchRow[];
  total: number;
}

export interface BatchDetailResponse extends BatchRow {
  purpose: string | null;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  response_uri: string | null;
  error: unknown;
  metadata: unknown;
  completed_at: string | null;
  cost_recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function getKgCostSummary(
  opts: { signal?: AbortSignal } = {},
): Promise<KgCostSummaryResponse> {
  const supabase = createClient();
  let query = supabase.rpc("fn_kg_cost_summary");
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  return assertData(data, error) as unknown as KgCostSummaryResponse;
}

/** Table column id → the database function's sort key (the "points" twin sorts like its USD column). */
const ORG_SORT: Record<string, string> = {
  organization: "organization",
  daily_auto_rag_cost_used_usd: "used",
  daily_auto_rag_cost_used_usd_points: "used",
  daily_auto_rag_budget_usd: "budget",
  daily_auto_rag_budget_usd_points: "budget",
  percent_used: "percent_used",
  last_charge_at: "last_charge_at",
};

/** The table's controlled query state → `admin_kg_cost_orgs`'s filter bag. */
export function orgCostFilters(state: MatrxDataTableQueryState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (state.search.trim()) out.search = state.search.trim();
  const numberKey: Record<string, string> = {
    daily_auto_rag_cost_used_usd: "used",
    daily_auto_rag_budget_usd: "budget",
    percent_used: "percent",
  };
  for (const [id, f] of Object.entries(state.columnFilters)) {
    if (!f) continue;
    if (id === "organization" && f.kind === "text" && f.value.trim()) out.organization = f.value.trim();
    else if (numberKey[id] && f.kind === "number") {
      const key = numberKey[id];
      const op = f.op ?? "between";
      if (op === "eq") {
        if (f.min !== undefined) { out[`min_${key}`] = f.min; out[`max_${key}`] = f.min; }
      } else {
        if ((op === "between" || op === "gt") && f.min !== undefined) out[`min_${key}`] = f.min;
        if ((op === "between" || op === "lt") && f.max !== undefined) out[`max_${key}`] = f.max;
      }
    } else if (id === "last_charge_at" && f.kind === "date") {
      const bounds = dateFilterBounds(f);
      if (bounds.since) out.last_charge_since = bounds.since;
      if (bounds.until) out.last_charge_until = bounds.until;
    }
  }
  return out;
}

/** One page of the organization cost table, searched/filtered/sorted by the database over EVERY organization. */
export async function searchOrgCosts(
  state: MatrxDataTableQueryState,
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostListResponse> {
  const supabase = createClient();
  const sortKey = state.sort ? ORG_SORT[state.sort.id] : undefined;
  let query = supabase.rpc("admin_kg_cost_orgs", {
    p_filters: orgCostFilters(state) as never,
    p_sort: sortKey ?? "used",
    p_dir: sortKey ? (state.sort?.direction ?? "desc") : "desc",
    p_limit: state.pageSize,
    p_offset: (Math.max(state.page, 1) - 1) * state.pageSize,
  });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  return assertData(data, error) as unknown as OrgCostListResponse;
}

export async function getOrgCostDetail(
  orgId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostDetailResponse> {
  const supabase = createClient();
  let query = supabase.rpc("fn_kg_cost_org_detail", { p_org_id: orgId });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  return assertData(data, error) as unknown as OrgCostDetailResponse;
}

export async function listPendingBatches(
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<PendingBatchListResponse> {
  const supabase = createClient();
  let query = supabase.rpc("fn_kg_cost_pending_batches", {
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  return assertData(data, error) as unknown as PendingBatchListResponse;
}

export async function getBatchDetail(
  batchRowId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BatchDetailResponse> {
  const supabase = createClient();
  let query = supabase.rpc("fn_kg_cost_batch_detail", {
    p_batch_id: batchRowId,
  });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  return assertData(data, error) as unknown as BatchDetailResponse;
}
