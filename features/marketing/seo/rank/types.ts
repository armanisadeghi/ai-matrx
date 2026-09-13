/**
 * SEO rank-collection receipt — the durable outcome of one SERP-rank run.
 *
 * Backend source of truth: aidream
 * `packages/matrx-seo/matrx_seo/contracts.py` (CollectionReceipt), returned by
 * the `seo` tool (action=collect_rank) as `{ receipt: … }` and streamed by the
 * marketing rank surfaces as `seo.rank_check_completed`.
 *
 * The receipt is a RECEIPT, not the ranks: it reports what the run persisted
 * (observations created vs already present) and whether it was served from
 * cache. The ranks themselves live in `seo.*` and are read separately.
 */

import { formatRelativeTime } from "@ai-matrx/kit/format";

export interface SeoCollectionReceipt {
  /** Persisted collection-run id. Internal — never rendered to users. */
  run_id: string;
  raw_payload_id?: string | null;
  created_observations: number;
  existing_observations: number;
  /** True when an equivalent completed run was reused instead of re-fetched. */
  reused_completed_run: boolean;
  from_cache: boolean;
  cache_age_seconds?: number | null;
  freshness_ttl_seconds?: number | null;
}

/** Defensive read of an untyped receipt blob. Returns null when unrecognizable. */
export function parseSeoCollectionReceipt(
  raw: unknown,
): SeoCollectionReceipt | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.run_id !== "string") return null;
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  const optNum = (v: unknown): number | null =>
    typeof v === "number" ? v : null;
  return {
    run_id: o.run_id,
    raw_payload_id: typeof o.raw_payload_id === "string" ? o.raw_payload_id : null,
    created_observations: num(o.created_observations),
    existing_observations: num(o.existing_observations),
    reused_completed_run: o.reused_completed_run === true,
    from_cache: o.from_cache === true,
    cache_age_seconds: optNum(o.cache_age_seconds),
    freshness_ttl_seconds: optNum(o.freshness_ttl_seconds),
  };
}

/**
 * "4m ago" / "2h ago" — compact age for a cached run.
 *
 * The local s/m/h/d cascade was collapsed onto the kit formatter (2026-09-12).
 * Kept as an ADAPTER because the receipt renderer calls it and the `null` for
 * an absent or negative age is a display decision (render no chip), not an
 * age. This is an AGE, not a duration, so it speaks the relative-time voice —
 * short and suffixed — rather than a duration style.
 */
export function formatCacheAge(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  return formatRelativeTime(Date.now() - seconds * 1000, { style: "short" });
}
