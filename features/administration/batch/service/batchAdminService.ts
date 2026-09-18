/**
 * features/administration/batch/service/batchAdminService.ts
 *
 * Direct-to-Supabase reads for the platform Batch admin surface
 * (`/administration/knowledge/batch`).
 *
 * WHY DIRECT READS: `batch.work_item` / `batch.provider_batch` are `ledger`
 * tables — `authenticated` holds SELECT only, the server writes (matrx-batch
 * FEATURE.md § Access). PostgREST exposes the `batch` schema and RLS is the
 * authorization layer, so there is nothing for a Next route or the Python
 * server to add; reads go React -> Supabase (CLAUDE.md § Data flow).
 *
 * TWO READ SHAPES, ON PURPOSE:
 *   - Counts are `head: true` exact counts. The queue is unbounded by design,
 *     so a count must never be `rows.length` of a page PostgREST silently
 *     capped at 1000.
 *   - Savings are NOT computed here: they come from `batch.savings_summary`
 *     through the shared `features/batch-savings` service — the one savings
 *     computation every surface reads (actual tokens at the live rate).
 * Nothing here treats a rendered page as a complete set.
 */
import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import { fetchBatchSavings } from "@/features/batch-savings/service";
import type { Database } from "@/types/database.types";

type WorkItemRow = Database["batch"]["Tables"]["work_item"]["Row"];
type ProviderBatchRow = Database["batch"]["Tables"]["provider_batch"]["Row"];

/** The lifecycle the DB trigger `batch.enforce_work_item_lifecycle()` enforces. */
export const WORK_ITEM_STATUSES = [
  "pending",
  "claimed",
  "submitted",
  "completed",
  "failed",
  "dead_letter",
  "abandoned",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/**
 * `handler_status` is deliberately unconstrained in the DB (re-drivable by
 * design), so this list is the vocabulary we RENDER, not a CHECK constraint.
 * A value outside it still shows — see `handlerBucketOf`.
 */
export const HANDLER_STATUSES = [
  "none",
  "dispatched",
  "succeeded",
  "failed",
  "dead",
] as const;
export type HandlerStatusKey = (typeof HANDLER_STATUSES)[number];

export const PROVIDER_BATCH_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "expired",
] as const;

/** NULL means "the result has not been handed to a handler yet". */
export function handlerBucketOf(value: string | null): string {
  return value === null || value === "" ? "none" : value;
}

export const WORK_ITEM_COLUMNS =
  "id, custom_id, purpose, provider, model, status, handler_status, attempt_count, " +
  "est_live_cost_usd, actual_cost_usd, live_equivalent_cost_usd, est_tokens_in, est_tokens_out, tokens_in, tokens_out, " +
  "cache_read_tokens, link_kind, link_id, prefix_group_key, dedupe_key, urgency, " +
  "result_handler, organization_id, provider_batch_row_id, error, handler_error, " +
  "deadline_at, escalated_at, escalation_strategy, claimed_at, lease_expires_at, " +
  "created_at, submitted_at, completed_at, updated_at";

export type WorkItem = Pick<
  WorkItemRow,
  | "id"
  | "custom_id"
  | "purpose"
  | "provider"
  | "model"
  | "status"
  | "handler_status"
  | "attempt_count"
  | "est_live_cost_usd"
  | "actual_cost_usd"
  | "live_equivalent_cost_usd"
  | "est_tokens_in"
  | "est_tokens_out"
  | "tokens_in"
  | "tokens_out"
  | "cache_read_tokens"
  | "link_kind"
  | "link_id"
  | "prefix_group_key"
  | "dedupe_key"
  | "urgency"
  | "result_handler"
  | "organization_id"
  | "provider_batch_row_id"
  | "error"
  | "handler_error"
  | "deadline_at"
  | "escalated_at"
  | "escalation_strategy"
  | "claimed_at"
  | "lease_expires_at"
  | "created_at"
  | "submitted_at"
  | "completed_at"
  | "updated_at"
>;

export const PROVIDER_BATCH_COLUMNS =
  "id, provider, batch_id, purpose, status, request_count, model, prefix_group_key, " +
  "est_live_cost_usd, est_cost_usd, cost_usd, live_equivalent_cost_usd, tokens_in, tokens_out, cache_read_tokens, " +
  "cache_write_tokens, poll_count, escalation_state, escalation_requested_at, " +
  "cancel_requested_at, last_polled_at, next_poll_at, error, organization_id, " +
  "submitted_at, completed_at, created_at";

export type ProviderBatch = Pick<
  ProviderBatchRow,
  | "id"
  | "provider"
  | "batch_id"
  | "purpose"
  | "status"
  | "request_count"
  | "model"
  | "prefix_group_key"
  | "est_live_cost_usd"
  | "est_cost_usd"
  | "cost_usd"
  | "live_equivalent_cost_usd"
  | "tokens_in"
  | "tokens_out"
  | "cache_read_tokens"
  | "cache_write_tokens"
  | "poll_count"
  | "escalation_state"
  | "escalation_requested_at"
  | "cancel_requested_at"
  | "last_polled_at"
  | "next_poll_at"
  | "error"
  | "organization_id"
  | "submitted_at"
  | "completed_at"
  | "created_at"
>;

function batchSchema() {
  return createClient().schema("batch");
}

// ---------------------------------------------------------------------------
// Queue state
// ---------------------------------------------------------------------------

export interface QueueState {
  /** Exact count per `status`, every lifecycle value present (0 included). */
  byStatus: Record<string, number>;
  /** Exact count per `handler_status`; NULL collapses into `none`. */
  byHandler: Record<string, number>;
  /** The alarm: answer returned + money spent, delivered nowhere. */
  undelivered: number;
  total: number;
}

export async function fetchQueueState(
  opts: { signal?: AbortSignal } = {},
): Promise<QueueState> {
  const sb = batchSchema();

  const statusCounts = await Promise.all(
    WORK_ITEM_STATUSES.map(async (status) => {
      let q = sb
        .from("work_item")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (opts.signal) q = q.abortSignal(opts.signal);
      const { count, error } = await q;
      if (error) throw new Error(`batch.work_item count(${status}): ${error.message}`);
      return [status, count ?? 0] as const;
    }),
  );

  const handlerCounts = await Promise.all(
    HANDLER_STATUSES.map(async (key) => {
      let q = sb.from("work_item").select("id", { count: "exact", head: true });
      q = key === "none" ? q.is("handler_status", null) : q.eq("handler_status", key);
      if (opts.signal) q = q.abortSignal(opts.signal);
      const { count, error } = await q;
      if (error) throw new Error(`batch.work_item count(handler:${key}): ${error.message}`);
      return [key, count ?? 0] as const;
    }),
  );

  let totalQuery = sb.from("work_item").select("id", { count: "exact", head: true });
  if (opts.signal) totalQuery = totalQuery.abortSignal(opts.signal);
  const { count: total, error: totalError } = await totalQuery;
  if (totalError) throw new Error(`batch.work_item count(total): ${totalError.message}`);

  let undeliveredQuery = sb
    .from("work_item")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .eq("handler_status", "dead");
  if (opts.signal) undeliveredQuery = undeliveredQuery.abortSignal(opts.signal);
  const { count: undelivered, error: undeliveredError } = await undeliveredQuery;
  if (undeliveredError) {
    throw new Error(`batch.work_item count(undelivered): ${undeliveredError.message}`);
  }

  return {
    byStatus: Object.fromEntries(statusCounts),
    byHandler: Object.fromEntries(handlerCounts),
    undelivered: undelivered ?? 0,
    total: total ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Savings — over COMPLETED work only, inside an explicit window
// ---------------------------------------------------------------------------

export type SavingsWindow = "7d" | "30d" | "all";

export interface SavingsRollup {
  window: SavingsWindow;
  /** Completed, priced items the saving covers. */
  items: number;
  /** The same actual tokens at the same model's live catalog rate. */
  liveEquivalentUsd: number;
  /** What it actually cost through the provider Batch API. */
  actualUsd: number;
  savedUsd: number;
  savedPct: number | null;
  /** The pre-submission estimate for the same items — shown labelled, never a saving basis. */
  preSubmissionEstimateUsd: number;
  /** Completed items with tokens but no price — excluded from every sum. */
  unpricedItems: number;
  tokensIn: number;
  cacheReadTokens: number;
  /** Share of input tokens served from a provider prefix cache. */
  cacheReadPct: number | null;
  /** Of the completed items in this window, how many were never delivered. */
  undeliveredItems: number;
  /** Money spent on answers that reached nobody. */
  undeliveredUsd: number;
}

function windowStart(window: SavingsWindow): Date | null {
  if (window === "all") return null;
  const days = window === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000);
}

/** numeric() can arrive as a string on some transports — never trust the wire type. */
export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The batch savings band — a window over `batch.savings_summary`, nothing computed here. */
export async function fetchSavings(
  window: SavingsWindow,
  opts: { signal?: AbortSignal } = {},
): Promise<SavingsRollup> {
  const s = await fetchBatchSavings({
    from: windowStart(window),
    to: null,
    signal: opts.signal,
  });
  return {
    window,
    items: s.items,
    liveEquivalentUsd: s.liveEquivalentUsd,
    actualUsd: s.actualUsd,
    savedUsd: s.savedUsd,
    savedPct: s.discountPct,
    preSubmissionEstimateUsd: s.preSubmissionEstimateUsd,
    unpricedItems: s.unpricedItems,
    tokensIn: s.tokensIn,
    cacheReadTokens: s.cacheReadTokens,
    cacheReadPct:
      s.tokensIn > 0 ? (s.cacheReadTokens / s.tokensIn) * 100 : null,
    undeliveredItems: s.undeliveredItems,
    undeliveredUsd: s.undeliveredUsd,
  };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export interface WorkItemFilters {
  status?: string | null;
  handler?: string | null;
  purpose?: string | null;
  provider?: string | null;
  search?: string | null;
  /** `batch.provider_batch.id` — the items one provider submission carried. */
  batchRowId?: string | null;
}

export interface WorkItemPage {
  items: WorkItem[];
  /** Exact number of rows matching the filter — not `items.length`. */
  matched: number;
  /** True when `matched` exceeds what this page carries. */
  truncated: boolean;
}

export const WORK_ITEM_PAGE_SIZE = 200;

export async function listWorkItems(
  filters: WorkItemFilters = {},
  opts: { signal?: AbortSignal; limit?: number } = {},
): Promise<WorkItemPage> {
  const limit = opts.limit ?? WORK_ITEM_PAGE_SIZE;
  let q = batchSchema()
    .from("work_item")
    .select(WORK_ITEM_COLUMNS, { count: "exact" });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.handler) {
    q = filters.handler === "none"
      ? q.is("handler_status", null)
      : q.eq("handler_status", filters.handler);
  }
  if (filters.purpose) q = q.eq("purpose", filters.purpose);
  if (filters.provider) q = q.eq("provider", filters.provider);
  if (filters.batchRowId) q = q.eq("provider_batch_row_id", filters.batchRowId);
  if (filters.search) {
    const term = `%${filters.search.replace(/[%,]/g, "")}%`;
    q = q.or(`custom_id.ilike.${term},link_id.ilike.${term},model.ilike.${term}`);
  }

  q = q.order("created_at", { ascending: false }).limit(limit);
  if (opts.signal) q = q.abortSignal(opts.signal);

  const { data, error, count } = await q;
  if (error) throw new Error(`batch.work_item list: ${error.message}`);
  const items = (data ?? []) as unknown as WorkItem[];
  const matched = count ?? items.length;
  return { items, matched, truncated: matched > items.length };
}

/** Distinct purposes/providers for the filter bar — read complete, it drives a control. */
export async function fetchWorkItemFacets(
  opts: { signal?: AbortSignal } = {},
): Promise<{ purposes: string[]; providers: string[] }> {
  const sb = batchSchema();
  const rows = await readAllRows<Pick<WorkItemRow, "id" | "purpose" | "provider">>(
    ({ from, to }) => {
      let q = sb
        .from("work_item")
        .select("id, purpose, provider", { count: "exact" })
        .order("id", { ascending: true })
        .range(from, to);
      if (opts.signal) q = q.abortSignal(opts.signal);
      return q;
    },
    { label: "batch.work_item (facets)" },
  );
  return {
    purposes: [...new Set(rows.map((r) => r.purpose))].sort(),
    providers: [...new Set(rows.map((r) => r.provider))].sort(),
  };
}

export async function listProviderBatches(
  opts: { signal?: AbortSignal } = {},
): Promise<ProviderBatch[]> {
  const sb = batchSchema();
  return readAllRows<ProviderBatch>(
    ({ from, to }) => {
      let q = sb
        .from("provider_batch")
        .select(PROVIDER_BATCH_COLUMNS, { count: "exact" })
        .order("submitted_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (opts.signal) q = q.abortSignal(opts.signal);
      return q as unknown as PromiseLike<{
        data: ProviderBatch[] | null;
        error: { message: string } | null;
        count?: number | null;
      }>;
    },
    { label: "batch.provider_batch", maxRows: 5000 },
  );
}
