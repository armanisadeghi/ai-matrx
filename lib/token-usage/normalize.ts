/**
 * lib/token-usage/normalize.ts
 *
 * THE canonical way to read a persisted `token_usage` JSONB blob.
 *
 * Every LLM-writing table on the platform (`research.rs_analysis`,
 * `rs_synthesis`, `rs_document`, and the chat/podcast run tables) stores the
 * same server-side payload: the `AggregatedUsageResult` shape generated from
 * the Python API contract —
 *
 *   { "total":    { input_tokens, output_tokens, cached_input_tokens,
 *                   total_tokens, total_requests, total_cost, ... },
 *     "by_model": { "<model-name>": { input_tokens, output_tokens, cost,
 *                                     api, request_count, ... } } }
 *
 * It has NEVER been a flat `{ input_tokens, estimated_cost }` object. Readers
 * that assumed the flat shape silently rendered 0 tokens / no cost on real
 * data — that exact bug shipped twice (aidream's `_sum_usage`, fixed
 * 2026-07-14 in `research/usage.py`; the frontend's `tokenUsageFromJson`,
 * fixed here 2026-07-24). This module is the single reader so it cannot
 * happen a third time: parse ONCE, here, and consume `NormalizedUsage`.
 *
 * DOCTRINE: never hand-read `token_usage.input_tokens` or
 * `token_usage.estimated_cost` at a callsite. Import `normalizeTokenUsage`.
 * The flat branch below exists only to keep pre-2026 rows readable; it is a
 * compat path, not a supported write shape.
 */

import type {
  AggregatedUsageResult,
  ModelUsageSummary,
} from "@/types/python-generated/stream-events";

/** One model's contribution to a single persisted call. */
export interface NormalizedUsageModel {
  /** Model name as the server recorded it, e.g. "gpt-5.4-mini". */
  model: string;
  /** Provider family, e.g. "openai" | "google". Null when unrecorded. */
  api: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  /** Null means "this model's cost could not be priced", NOT "free". */
  costUsd: number | null;
}

/** A persisted `token_usage` blob, flattened for display and arithmetic. */
export interface NormalizedUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Provider requests this row represents (usually 1, more for retries). */
  requests: number;
  /** Null means unpriced, NOT free — render "—", never "$0". */
  costUsd: number | null;
  /** False when at least one request in the blob could not be priced. */
  costIsComplete: boolean;
  unknownCostRequests: number;
  models: NormalizedUsageModel[];
  /** Which storage shape this row was written in. */
  shape: "aggregated" | "flat";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeByModel(
  byModel: Record<string, ModelUsageSummary> | undefined,
): NormalizedUsageModel[] {
  if (!isRecord(byModel)) return [];
  return Object.entries(byModel).map(([model, raw]) => {
    const m = isRecord(raw) ? raw : {};
    return {
      model,
      api: typeof m.api === "string" ? m.api : null,
      inputTokens: num(m.input_tokens),
      cachedInputTokens: num(m.cached_input_tokens),
      outputTokens: num(m.output_tokens),
      totalTokens: num(m.total_tokens),
      requests: num(m.request_count),
      costUsd: optionalNum(m.cost),
    };
  });
}

/**
 * Read any persisted `token_usage` value into `NormalizedUsage`.
 *
 * Returns null only when the blob carries no usable signal at all (null,
 * non-object, or an empty object) — so a null return means "nothing was
 * recorded", which callers should render as "—" rather than as zero.
 */
export function normalizeTokenUsage(raw: unknown): NormalizedUsage | null {
  if (!isRecord(raw)) return null;

  // ── Canonical shape: { total, by_model } ────────────────────────────────
  const aggregated = raw as AggregatedUsageResult;
  if (isRecord(aggregated.total) || isRecord(aggregated.by_model)) {
    const total = isRecord(aggregated.total) ? aggregated.total : {};
    const models = normalizeByModel(aggregated.by_model);

    // `total.total_cost` is authoritative. Fall back to summing by_model only
    // when the server omitted the rollup, so a partially-priced blob still
    // reports what it knows instead of collapsing to zero.
    const rolledUpCost = optionalNum(total.total_cost);
    const modelCostSubtotal = models.reduce<number | null>((acc, m) => {
      if (m.costUsd == null) return acc;
      return (acc ?? 0) + m.costUsd;
    }, null);

    const unknownCostRequests = num(total.unknown_cost_requests);

    return {
      inputTokens: num(total.input_tokens),
      cachedInputTokens: num(total.cached_input_tokens),
      outputTokens: num(total.output_tokens),
      totalTokens: num(total.total_tokens),
      requests: num(total.total_requests) || models.length,
      costUsd: rolledUpCost ?? modelCostSubtotal,
      costIsComplete: unknownCostRequests === 0,
      unknownCostRequests,
      models,
      shape: "aggregated",
    };
  }

  // ── Legacy flat shape (pre-2026 rows only; never written today) ─────────
  const inputTokens = num(raw.input_tokens);
  const outputTokens = num(raw.output_tokens);
  const totalTokens = num(raw.total_tokens) || inputTokens + outputTokens;
  const costUsd =
    optionalNum(raw.cost_usd) ??
    optionalNum(raw.estimated_cost) ??
    optionalNum(raw.cost);
  const model = typeof raw.model === "string" ? raw.model : null;

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    totalTokens === 0 &&
    costUsd == null
  ) {
    return null;
  }

  return {
    inputTokens,
    cachedInputTokens: num(raw.cached_input_tokens),
    outputTokens,
    totalTokens,
    requests: 1,
    costUsd,
    costIsComplete: true,
    unknownCostRequests: 0,
    models: model
      ? [
          {
            model,
            api: null,
            inputTokens,
            cachedInputTokens: num(raw.cached_input_tokens),
            outputTokens,
            totalTokens,
            requests: 1,
            costUsd,
          },
        ]
      : [],
    shape: "flat",
  };
}

/** Zero-valued accumulator seed for `addUsage`. */
export function emptyUsage(): NormalizedUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requests: 0,
    costUsd: 0,
    costIsComplete: true,
    unknownCostRequests: 0,
    models: [],
    shape: "aggregated",
  };
}

/**
 * Fold one call's usage into a running total. Cost stays null-aware: an
 * unpriced call raises `unknownCostRequests` and clears `costIsComplete`
 * instead of quietly adding zero dollars.
 */
export function addUsage(
  acc: NormalizedUsage,
  usage: NormalizedUsage | null,
): NormalizedUsage {
  if (!usage) return acc;
  const unknown =
    acc.unknownCostRequests +
    usage.unknownCostRequests +
    (usage.costUsd == null ? Math.max(usage.requests, 1) : 0);
  return {
    inputTokens: acc.inputTokens + usage.inputTokens,
    cachedInputTokens: acc.cachedInputTokens + usage.cachedInputTokens,
    outputTokens: acc.outputTokens + usage.outputTokens,
    totalTokens: acc.totalTokens + usage.totalTokens,
    requests: acc.requests + usage.requests,
    costUsd: (acc.costUsd ?? 0) + (usage.costUsd ?? 0),
    costIsComplete: acc.costIsComplete && usage.costIsComplete && unknown === 0,
    unknownCostRequests: unknown,
    models: acc.models,
    shape: acc.shape,
  };
}

/** Sum the `by_model` entries of many calls into one per-model rollup. */
export function rollupByModel(
  usages: Array<NormalizedUsage | null>,
): NormalizedUsageModel[] {
  const byModel = new Map<string, NormalizedUsageModel>();
  for (const usage of usages) {
    if (!usage) continue;
    for (const m of usage.models) {
      const existing = byModel.get(m.model);
      if (!existing) {
        byModel.set(m.model, { ...m });
        continue;
      }
      existing.api = existing.api ?? m.api;
      existing.inputTokens += m.inputTokens;
      existing.cachedInputTokens += m.cachedInputTokens;
      existing.outputTokens += m.outputTokens;
      existing.totalTokens += m.totalTokens;
      existing.requests += m.requests;
      existing.costUsd =
        m.costUsd == null ? existing.costUsd : (existing.costUsd ?? 0) + m.costUsd;
    }
  }
  return [...byModel.values()].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
}
