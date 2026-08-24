/**
 * features/administration/kg-cost/service/kgCostService.ts
 *
 * Direct-to-Supabase client for the read-only KG-cost dashboard.
 * `public.fn_kg_cost_summary` / `_list_orgs` / `_org_detail` /
 * `_pending_batches` / `_batch_detail` mirror the retired
 * `aidream/api/routers/kg_cost.py` endpoints exactly — admin-gated INSIDE
 * each function (public.is_super_admin()), identity from auth.uid() only.
 */
import { makeAssertData } from "@/utils/errors";
import { createClient } from "@/utils/supabase/client";

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
  /** Batch system: est. live cost minus actual batch cost, completed batches, 7d. */
  batch_savings_7d_usd?: number;
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
// Unit economics — public.fn_kg_cost_unit_economics(p_days)
//
// Per-run ledger read from rag.ingest_run. Numeric columns arrive as strings
// from numeric(12,6) via jsonb, so every numeric field below is typed
// `number | string` and MUST be parsed with `Number(...)` at render time —
// never trust the wire type. Record: migrations/fn_kg_cost_unit_economics.sql
// ---------------------------------------------------------------------------

export interface UnitEconomicsBySourceKindRow {
  source_kind: string;
  runs: number;
  successes: number;
  errors: number;
  skips: number;
  stuck_running: number;
  total_cost_usd: number | string;
  p50_cost_usd: number | string;
  p90_cost_usd: number | string;
  max_cost_usd: number | string;
  cost_per_1k_chars_usd: number | string;
  embedding_cost_usd: number | string;
  extraction_cost_usd: number | string;
  cleanup_cost_usd: number | string;
  enrichment_cost_usd: number | string;
  embedding_cache_hits: number | string;
  embedding_calls: number | string;
  cache_hit_pct: number | string;
}

export interface UnitEconomicsEnrichment {
  runs_with_enrich: number;
  runs_without_enrich: number;
  avg_cost_with_enrich_usd: number | string;
  avg_cost_without_enrich_usd: number | string;
  multiplier: number | string | null;
}

export interface UnitEconomicsTotals {
  window_days: number;
  runs: number;
  total_cost_usd: number | string;
  embedding_cost_saved_usd: number | string;
  projected_monthly_usd: number | string;
  projected_monthly_10x_usd: number | string;
  inexact_cost_runs: number;
}

export interface UnitEconomicsRecentRun {
  id: string;
  organization_id: string | null;
  source_kind: string;
  source_id: string | null;
  triggered_by: string | null;
  status: string;
  skip_reason: string | null;
  chars_in: number | string | null;
  chunks_written: number | string | null;
  chunks_reused: number | string | null;
  embedding_cost_usd: number | string;
  extraction_cost_usd: number | string;
  cleanup_cost_usd: number | string;
  enrichment_cost_usd: number | string;
  total_cost_usd: number | string;
  cost_is_exact: boolean;
  enrich_ran: boolean;
  duration_ms: number | string | null;
  started_at: string;
}

export interface UnitEconomicsResponse {
  by_source_kind: UnitEconomicsBySourceKindRow[];
  enrichment: UnitEconomicsEnrichment;
  totals: UnitEconomicsTotals;
  recent_runs: UnitEconomicsRecentRun[];
}

export async function fetchUnitEconomics(
  days = 30,
  opts: { signal?: AbortSignal } = {},
): Promise<UnitEconomicsResponse> {
  const supabase = createClient();
  let query = supabase.rpc("fn_kg_cost_unit_economics", { p_days: days });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  return assertData(data, error) as unknown as UnitEconomicsResponse;
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

export async function listOrgCosts(
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostListResponse> {
  const supabase = createClient();
  let query = supabase.rpc("fn_kg_cost_list_orgs", {
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
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
