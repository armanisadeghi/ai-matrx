/**
 * UNIVERSAL FACET COVERAGE — data layer for the one honest gauge of whether the
 * 13-facet plane actually reaches this site's keywords (KI-022).
 *
 * WHY IT READS THE SERVER AND NOTHING ELSE. Progress lives in
 * `seo.keyword_classification_queue`, so a closed tab and a second tab always
 * agree, and a browser loop can never be the record of what got done. This
 * module reads `seo.keyword_classification_status(p_site_id, p_min_impressions)`
 * and nothing this document remembers.
 *
 * ADMIN-ONLY, BY THE FUNCTION'S OWN GATE. The RPC raises
 * `kwclass_status_forbidden: admin only` (`public.is_admin()`) before it reads
 * anything, and `POST /seo/keywords/classification/backfill` carries the same
 * `_require_admin` gate. The headline counts are PLATFORM-WIDE — the facet plane
 * is one classification per phrase shared by every tenant (P3 / KI-039) — so
 * that gate is the design, not an oversight. The caller hides the surface for
 * everyone else rather than showing a panel that can only refuse.
 *
 * THE DEMAND FLOOR IS THE SERVER'S NUMBER. `p_min_impressions` must match the
 * live `seo.keyword_classification.min_impressions` knob or `queue_deferred`
 * means nothing, so the caller reads the knob instead of assuming a value — a
 * shortened queue presented as the whole job is exactly the lie this gauge
 * exists to end.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 * Server half: aidream `services/seo/keyword_classification_backfill.py`.
 */

import { z } from "zod";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("read the universal facet coverage");

/** The knob namespace this surface obeys. */
export const FACET_KNOB_FEATURE = "seo.keyword_classification";

const facetCoverageSchema = z.object({
  // The whole platform corpus.
  keywords_total: z.number(),
  keywords_classified: z.number(),
  // The demand-ordered ledger: keywords that actually earned Search Console
  // traffic in the window, and the clicks/impressions behind them.
  demand_keywords: z.number(),
  demand_keywords_classified: z.number(),
  demand_clicks: z.number(),
  demand_clicks_classified: z.number(),
  demand_impressions: z.number(),
  demand_impressions_classified: z.number(),
  // What the backfill queue still owes.
  queue_pending: z.number(),
  queue_running: z.number(),
  queue_failed: z.number(),
  queue_deferred: z.number(),
  pending_clicks: z.number(),
  pending_impressions: z.number(),
  next_phrase: z.string().nullable(),
  last_error: z.string().nullable(),
  // Provenance — a coverage number without an as-of is a rumour.
  demand_window_days: z.number().nullable(),
  demand_as_of: z.string().nullable(),
  queue_refreshed_at: z.string().nullable(),
  last_classified_at: z.string().nullable(),
  // This site's own slice of the shared plane.
  site_keywords: z.number().nullable(),
  site_keywords_classified: z.number().nullable(),
  site_clicks: z.number().nullable(),
  site_clicks_classified: z.number().nullable(),
});

export type FacetCoverage = z.infer<typeof facetCoverageSchema>;

/**
 * Where the universal-facet plane stands, for this site and for the platform.
 *
 * COVERAGE ASKS THE KEYWORD, WORK ASKS THE QUEUE. The `*_classified` columns
 * count `seo.keyword.classifier_version is not null` — the fact — while
 * `queue_pending` / `_deferred` / `_failed` count the ledger. Until
 * `migrations/seo_ki022_facet_coverage_by_classifier_version.sql` the demand
 * columns asked the ledger too, so every keyword classified by any path other
 * than the backfill (the admin batch classifier, an import, a re-run) counted
 * as UNCOVERED: measured live it reported 42.6% of demand clicks covered
 * against 60.0% truly covered. A meter whose whole job is trust cannot be
 * measuring its own bookkeeping.
 */
export async function getFacetCoverage(
  siteId: string,
  minImpressions: number,
  signal?: AbortSignal,
): Promise<FacetCoverage> {
  const response = await (await seoDb())
    .rpc("keyword_classification_status", {
      p_site_id: siteId,
      p_min_impressions: minImpressions,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const data = assertData(
    response.data,
    response.error,
    "read the universal facet coverage",
  );
  const row = Array.isArray(data) ? data[0] : data;
  return facetCoverageSchema.parse(row);
}

/** What one backfill pass reports when it settles (`seo.backfill_completed`). */
export interface FacetBackfillResult {
  claimed: number;
  classified: number;
  returned_to_queue: number;
  quarantined: number;
  classified_today: number;
  daily_ceiling: number;
  ceiling_reached: boolean;
  queue_pending: number;
  queue_deferred: number;
  pending_clicks: number;
  error: string | null;
  top_phrases: string[];
  /**
   * KI-044 — NULL when the pass ran. `autonomy_off` /
   * `autonomy_review_required` when the ladder said it may not write, so the
   * strip never reports "nothing to classify" over a step that was not allowed
   * to run. The classifier writes UNIVERSAL facts (the shared keyword
   * dictionary), so it resolves the PLATFORM rung.
   */
  skipped?: string | null;
  autonomy_mode?: string;
  autonomy_decision?: string;
  autonomy_refusal?: string | null;
}

/** The endpoint one press advances by exactly one bounded, demand-ordered pass. */
export const FACET_BACKFILL_PATH = "/seo/keywords/classification/backfill";

/**
 * The server's own milestones, in the reader's words. Never invented — each key
 * is a kind `run_backfill_pass` actually emits.
 */
export const FACET_BACKFILL_STAGES: Record<string, string> = {
  "seo.backfill_refreshed": "Re-measuring Search Console demand…",
  "seo.backfill_claimed": "Claiming the highest-demand keywords…",
  "seo.backfill_ceiling_reached": "Today's classification ceiling is reached",
  "seo.backfill_settled": "Saving what this pass classified…",
  "seo.backfill_completed": "Pass complete",
};

// ── KI-022, the other half: coverage PER DIMENSION ──────────────────────────

/**
 * THE HONEST GAUGE, ONE ROW PER QUESTION.
 *
 * The universal meter above answers "has the shared 13-facet plane reached my
 * keywords". It cannot answer the question a person actually acts on: *which
 * of my questions has an answer, and which is a filter over nothing?* A
 * dimension that describes 3% of the corpus will happily narrow a list to
 * three rows and look like a finding about the business when it is a finding
 * about the backfill queue.
 *
 * ONE SERVER READ (`seo.gsc_dimension_coverage`), never re-derived here. The
 * caller sorts and phrases; every count on the screen is the database's. The
 * RPC asserts site access like every other `gsc_*` read (THE SCOPE RULE), so
 * this is a normal site-owner surface, not an admin one.
 */
export const DIMENSION_COVERAGE_KNOB_FEATURE = "seo.dimension_coverage";

const assertDimensionCoverage = makeAssertData(
  "read the per-dimension coverage",
);

const dimensionCoverageSchema = z.object({
  dimension: z.string(),
  dimension_label: z.string(),
  scope: z.string(),
  nature: z.string(),
  /** Both denominators are the WINDOW's, identical on every row. */
  total_clicks: z.number(),
  total_keywords: z.number(),
  /** Answered — abstains excluded, because "not clear" is not an answer. */
  decided_clicks: z.number(),
  decided_keywords: z.number(),
  /** Looked at at all. `stamped - decided` is the "could not tell" slice. */
  stamped_clicks: z.number(),
  stamped_keywords: z.number(),
});

export type DimensionCoverageRow = z.infer<typeof dimensionCoverageSchema>;

export async function getDimensionCoverage(
  siteId: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<DimensionCoverageRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_dimension_coverage", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const data = assertDimensionCoverage(
    response.data,
    response.error,
    "read how much of your traffic each dimension describes",
  );
  return z.array(dimensionCoverageSchema).parse(data ?? []);
}
