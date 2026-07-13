/**
 * features/administration/kg-cost/service/kgCostService.ts
 *
 * Typed client for the read-only KG-cost backend
 * (`aidream/api/routers/kg_cost.py`, bare prefix `/kg-cost`).
 *
 * React → Python directly (per CLAUDE.md — no Next.js middle hop). Every
 * wire type below is DERIVED from the OpenAPI-generated contract
 * (`types/python-generated/api-types.ts`), never hand-mirrored — a backend
 * rename lights up every drifted callsite as a compile error after
 * `pnpm sync-types`. This is an admin-only surface, gated by the (admin)
 * layout + `_require_admin` on every Python handler.
 */
import { apiGet, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

// ---------------------------------------------------------------------------
// Wire types — DERIVED from the generated contract (source of truth)
// ---------------------------------------------------------------------------

// The provider / kind / status enums have no standalone generated schema —
// they are inlined on the batch models. Derive them off a contract field so
// they still track the wire vocabulary.
export type BatchStatus = components["schemas"]["BatchRow"]["status"];
export type BatchProvider = components["schemas"]["BatchRow"]["provider"];
export type BatchKind = components["schemas"]["BatchRow"]["kind"];

export type KgCostSummaryResponse =
  components["schemas"]["KgCostSummaryResponse"];

export type OrgCostRow = components["schemas"]["OrgCostRow"];

export type OrgCostListResponse = components["schemas"]["OrgCostListResponse"];

export type DailySpendPoint = components["schemas"]["DailySpendPoint"];

export type TopSourceRow = components["schemas"]["TopSourceRow"];

export type BatchSummaryByStatus =
  components["schemas"]["BatchSummaryByStatus"];

export type OrgCostDetailResponse =
  components["schemas"]["OrgCostDetailResponse"];

export type BatchRow = components["schemas"]["BatchRow"];

export type PendingBatchListResponse =
  components["schemas"]["PendingBatchListResponse"];

export type BatchDetailResponse = components["schemas"]["BatchDetailResponse"];

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function getKgCostSummary(
  opts: { signal?: AbortSignal } = {},
): Promise<KgCostSummaryResponse> {
  const { data } = await apiGet("/kg-cost/summary", {
    signal: opts.signal,
  });
  return data;
}

export async function listOrgCosts(
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostListResponse> {
  const { data } = await apiGet("/kg-cost/orgs", {
    signal: opts.signal,
    query: { limit: params.limit ?? 100, offset: params.offset ?? 0 },
  });
  return data;
}

export async function getOrgCostDetail(
  orgId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<OrgCostDetailResponse> {
  const { data } = await apiGet(
    buildPath("/kg-cost/orgs/{org_id}", { org_id: orgId }),
    { signal: opts.signal },
  );
  return data;
}

export async function listPendingBatches(
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<PendingBatchListResponse> {
  const { data } = await apiGet("/kg-cost/batches/pending", {
    signal: opts.signal,
    query: { limit: params.limit ?? 100, offset: params.offset ?? 0 },
  });
  return data;
}

export async function getBatchDetail(
  batchRowId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BatchDetailResponse> {
  const { data } = await apiGet(
    buildPath("/kg-cost/batches/{batch_row_id}", { batch_row_id: batchRowId }),
    { signal: opts.signal },
  );
  return data;
}
