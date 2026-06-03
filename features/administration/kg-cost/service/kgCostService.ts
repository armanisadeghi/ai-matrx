/**
 * features/administration/kg-cost/service/kgCostService.ts
 *
 * Typed client for the read-only KG-cost backend
 * (`aidream/api/routers/kg_cost.py`, bare prefix `/kg-cost`).
 *
 * React → Python directly (per CLAUDE.md — no Next.js middle hop). The
 * response shapes here mirror the Pydantic models the Python team declared
 * in `aidream/api/schemas/kg_cost.py`; keep them in sync. This is an
 * admin-only surface, gated by the (admin) layout + `_require_admin` on
 * every Python handler.
 */
import { getJson } from "@/lib/python-client";

// ---------------------------------------------------------------------------
// Wire types — mirror aidream/api/schemas/kg_cost.py
// ---------------------------------------------------------------------------

export type BatchStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type BatchProvider = "openai" | "anthropic";
export type BatchKind = "chat" | "embedding";

export interface KgCostSummaryResponse {
  spend_today_usd: number;
  spend_7d_usd: number;
  orgs_over_80pct: number;
  pending_batches: number;
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
  date: string; // YYYY-MM-DD
  cost_usd: number;
}

export interface TopSourceRow {
  source: string;
  cost_usd: number;
  count: number;
}

export interface BatchSummaryByStatus {
  status: BatchStatus;
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
  custom_id: string;
  provider: BatchProvider;
  batch_id: string | null;
  kind: BatchKind;
  user_id: string;
  organization_id: string | null;
  organization_name: string | null;
  source_kind: string | null;
  source_id: string | null;
  status: BatchStatus;
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

export interface BatchDetailResponse {
  id: string;
  custom_id: string;
  provider: BatchProvider;
  batch_id: string | null;
  kind: BatchKind;
  user_id: string;
  organization_id: string | null;
  organization_name: string | null;
  source_kind: string | null;
  source_id: string | null;
  purpose: string;
  status: BatchStatus;
  est_cost_usd: number;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  poll_count: number;
  last_polled_at: string | null;
  response_uri: string | null;
  error: unknown;
  metadata: unknown;
  submitted_at: string;
  completed_at: string | null;
  next_poll_at: string | null;
  cost_recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && `${value}` !== "") {
      qs.set(key, `${value}`);
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function getKgCostSummary(
  opts: { signal?: AbortSignal } = {},
): Promise<KgCostSummaryResponse> {
  const { data } = await getJson<KgCostSummaryResponse>("/kg-cost/summary", {
    signal: opts.signal,
  });
  return data;
}

export async function listOrgCosts(
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostListResponse> {
  const query = buildQuery({
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
  });
  const { data } = await getJson<OrgCostListResponse>(`/kg-cost/orgs${query}`, {
    signal: opts.signal,
  });
  return data;
}

export async function getOrgCostDetail(
  orgId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostDetailResponse> {
  const { data } = await getJson<OrgCostDetailResponse>(
    `/kg-cost/orgs/${encodeURIComponent(orgId)}`,
    { signal: opts.signal },
  );
  return data;
}

export async function listPendingBatches(
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<PendingBatchListResponse> {
  const query = buildQuery({
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
  });
  const { data } = await getJson<PendingBatchListResponse>(
    `/kg-cost/batches/pending${query}`,
    { signal: opts.signal },
  );
  return data;
}

export async function getBatchDetail(
  batchRowId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BatchDetailResponse> {
  const { data } = await getJson<BatchDetailResponse>(
    `/kg-cost/batches/${encodeURIComponent(batchRowId)}`,
    { signal: opts.signal },
  );
  return data;
}
