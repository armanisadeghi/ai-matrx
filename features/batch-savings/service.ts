// features/batch-savings/service.ts
//
// The ONE read path for batch spend and savings: React → Supabase →
// `batch.savings_summary` (SECURITY INVOKER — RLS on batch.work_item and
// runtime.global_execution authorizes; the organization argument only scopes).
//
// The saving is `live_equivalent_cost_usd − actual_cost_usd`: the item's ACTUAL
// tokens priced at the same model's LIVE catalog rate, minus the bill. The
// pre-submission estimate (`est_live_cost_usd`) is never a saving basis — the
// 2026-09-13 run read 76.8% on the estimate for what was really 50%. Guard:
// aidream scripts/check_batch_savings_source.py.
//
// Doc: features/batch-savings/FEATURE.md

import { createClient } from "@/utils/supabase/client";

import type {
  BatchLaneSplit,
  BatchSavingsRow,
  BatchSavingsSummary,
} from "./types";

function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** numeric() arrives as a number or a string depending on magnitude — never trust the wire type. */
function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return num(value);
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function row(
  value: unknown,
  key: (r: Record<string, unknown>) => string,
  label: (r: Record<string, unknown>) => string,
  sublabel: (r: Record<string, unknown>) => string | null = () => null,
): BatchSavingsRow {
  const r = rec(value);
  return {
    key: key(r),
    label: label(r),
    sublabel: sublabel(r),
    items: num(r.items),
    actualUsd: num(r.actual_usd),
    liveEquivalentUsd: num(r.live_equivalent_usd),
    savedUsd: num(r.saved_usd),
    discountPct: numOrNull(r.discount_pct),
  };
}

function lanes(value: unknown): BatchLaneSplit {
  const l = rec(value);
  return {
    ledgerUsd: num(l.ledger_usd),
    ledgerExecutions: num(l.ledger_executions),
    batchUsd: num(l.batch_usd),
    batchExecutions: num(l.batch_executions),
    escalatedUsd: num(l.escalated_usd),
    escalatedExecutions: num(l.escalated_executions),
    liveUsd: num(l.live_usd),
  };
}

export interface BatchSavingsQuery {
  /** Inclusive; null = open. */
  from: Date | null;
  /** Exclusive; null = open. */
  to: Date | null;
  /** Tenancy scope only — authorization is RLS. */
  organizationId?: string | null;
  signal?: AbortSignal;
}

export async function fetchBatchSavings({
  from,
  to,
  organizationId,
  signal,
}: BatchSavingsQuery): Promise<BatchSavingsSummary> {
  let request = createClient()
    .schema("batch")
    .rpc("savings_summary", {
      p_from: from ? from.toISOString() : undefined,
      p_to: to ? to.toISOString() : undefined,
      p_organization_id: organizationId ?? undefined,
    });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;

  const p = rec(data);
  if (Object.keys(p).length === 0) {
    throw new Error(
      "batch.savings_summary returned nothing, so no batch numbers are shown.",
    );
  }
  const w = rec(p.window);

  return {
    generatedAt: strOrNull(p.generated_at) ?? new Date().toISOString(),
    from: strOrNull(w.from),
    to: strOrNull(w.to),
    organizationId: strOrNull(p.organization_id),
    items: num(p.items),
    batchItems: num(p.batch_items),
    escalatedItems: num(p.escalated_items),
    completedItems: num(p.completed_items),
    unpricedItems: num(p.unpriced_items),
    actualUsd: num(p.actual_usd),
    liveEquivalentUsd: num(p.live_equivalent_usd),
    savedUsd: num(p.saved_usd),
    discountPct: numOrNull(p.discount_pct),
    batchActualUsd: num(p.batch_actual_usd),
    escalatedActualUsd: num(p.escalated_actual_usd),
    tokensIn: num(p.tokens_in),
    tokensOut: num(p.tokens_out),
    cacheReadTokens: num(p.cache_read_tokens),
    undeliveredItems: num(p.undelivered_items),
    undeliveredUsd: num(p.undelivered_usd),
    preSubmissionEstimateUsd: num(p.pre_submission_estimate_usd),
    firstCompletedAt: strOrNull(p.first_completed_at),
    lastCompletedAt: strOrNull(p.last_completed_at),
    byPurpose: arr(p.by_purpose).map((v) =>
      row(
        v,
        (r) => String(r.purpose ?? "(none)"),
        (r) => String(r.purpose ?? "Unnamed consumer"),
      ),
    ),
    byModel: arr(p.by_model).map((v) =>
      row(
        v,
        (r) => `${String(r.provider ?? "")}/${String(r.model ?? "")}`,
        (r) => String(r.model ?? "unknown model"),
        (r) => strOrNull(r.provider),
      ),
    ),
    byOrganization: arr(p.by_organization).map((v) =>
      row(
        v,
        (r) => String(r.organization_id ?? "(none)"),
        (r) => String(r.name ?? "Unattributed"),
      ),
    ),
    lanes: lanes(p.lanes),
  };
}
