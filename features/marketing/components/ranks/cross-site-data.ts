/**
 * Cross-site rank portfolio — direct Supabase reads for the `/marketing/ranks`
 * hub (every rank target the caller can see, across every brand and site).
 *
 * Two-lane rule (CLAUDE.md data flow): reads go DIRECT to the RLS-protected
 * `seo` schema under the caller's JWT; rank CHECKS (compute) stay on aidream
 * and live in the per-site workspace (`useRanks.ts`). Never add a read proxy.
 *
 * Fetch shape: bounded target list → batched `.in()` enrichment (keywords,
 * sites, observations) → client-side reduce to latest/previous/best per
 * target. Caps throw loudly — silent truncation would report "covered
 * everything" when it didn't.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

const TARGET_CAP = 2000;
const OBSERVATION_CAP = 20000;
/** Sparkline / movement window. */
export const RANK_HISTORY_DAYS = 90;

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

async function webDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("web");
}

// Type alias (not interface) so rows are assignable to the surface scope's
// Record<string, unknown> without a cast.
export type CrossSiteRankRow = {
  target_id: string;
  site_id: string | null;
  site_name: string | null;
  site_domain: string | null;
  brand_id: string | null;
  keyword: string;
  engine: string;
  device: string;
  search_type: string;
  /** User-facing tracking mode, e.g. "Brave" / "ChatGPT (AI answers)". */
  tracking_label: string;
  is_active: boolean;
  created_at: string;
  latest_position: number | null;
  previous_position: number | null;
  /** Positive = improved (moved up), negative = declined. */
  movement: number | null;
  best_position: number | null;
  last_checked_at: string | null;
  /** Oldest→newest organic ranks inside the history window (sparkline). */
  history: Array<{ observed_at: string; organic_rank: number | null }>;
};

/** User-facing tracking mode from stored target/observation facts. */
function describeTracking(engine: string, searchType: string): string {
  if (searchType === "local_pack") return "Google — Map pack";
  if (searchType === "ai_answer") {
    const names: Record<string, string> = {
      chat_gpt: "ChatGPT",
      perplexity: "Perplexity",
      gemini: "Gemini",
      claude: "Claude",
    };
    return `${names[engine] ?? engine} (AI answers)`;
  }
  const engines: Record<string, string> = {
    brave: "Brave",
    google: "Google",
    bing: "Bing",
  };
  return engines[engine] ?? engine;
}

export async function listCrossSiteRankPortfolio(
  signal?: AbortSignal,
): Promise<CrossSiteRankRow[]> {
  const abort = signal ?? new AbortController().signal;
  const seo = await seoDb();

  const targetsResponse = await seo
    .from("rank_target")
    .select(
      "id, site_id, keyword_id, engine, device, search_type, is_active, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(TARGET_CAP + 1)
    .abortSignal(abort);
  if (targetsResponse.error) throw targetsResponse.error;
  const targets = targetsResponse.data ?? [];
  if (targets.length > TARGET_CAP) {
    throw new Error(
      `Cross-site rank portfolio exceeds the ${TARGET_CAP}-target bound — move this hub to a controlled server-paged query before raising the cap.`,
    );
  }
  if (targets.length === 0) return [];

  const keywordIds = [...new Set(targets.map((t) => t.keyword_id))];
  const siteIds = [
    ...new Set(targets.map((t) => t.site_id).filter((v): v is string => !!v)),
  ];

  const [keywordsResponse, sitesResponse, observationsResponse] =
    await Promise.all([
      seo
        .from("keyword")
        .select("id, phrase")
        .in("id", keywordIds)
        .is("deleted_at", null)
        .abortSignal(abort),
      siteIds.length
        ? (await webDb())
            .from("site")
            .select("id, name, domain, brand_id")
            .in("id", siteIds)
            .is("deleted_at", null)
            .abortSignal(abort)
        : Promise.resolve({ data: [], error: null }),
      seo
        .from("rank_observation")
        .select("rank_target_id, observed_at, organic_rank")
        .in(
          "rank_target_id",
          targets.map((t) => t.id),
        )
        .gte(
          "observed_at",
          new Date(
            Date.now() - RANK_HISTORY_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        )
        .order("observed_at", { ascending: false })
        .limit(OBSERVATION_CAP + 1)
        .abortSignal(abort),
    ]);
  if (keywordsResponse.error) throw keywordsResponse.error;
  if (sitesResponse.error) throw sitesResponse.error;
  if (observationsResponse.error) throw observationsResponse.error;
  const observations = observationsResponse.data ?? [];
  if (observations.length > OBSERVATION_CAP) {
    throw new Error(
      `Cross-site rank observations exceed the ${OBSERVATION_CAP}-row bound over ${RANK_HISTORY_DAYS} days — narrow the window or page per target before raising the cap.`,
    );
  }

  const keywordById = new Map(
    (keywordsResponse.data ?? []).map((k) => [k.id, k.phrase]),
  );
  const siteById = new Map((sitesResponse.data ?? []).map((s) => [s.id, s]));

  // Newest-first from the query; group per target.
  const observationsByTarget = new Map<
    string,
    Array<{ observed_at: string; organic_rank: number | null }>
  >();
  for (const o of observations) {
    const list = observationsByTarget.get(o.rank_target_id) ?? [];
    list.push({ observed_at: o.observed_at, organic_rank: o.organic_rank });
    observationsByTarget.set(o.rank_target_id, list);
  }

  return targets.map((target): CrossSiteRankRow => {
    const site = target.site_id ? siteById.get(target.site_id) : undefined;
    const newestFirst = observationsByTarget.get(target.id) ?? [];
    const ranked = newestFirst.filter((o) => o.organic_rank !== null);
    const latest = ranked[0] ?? null;
    const previous = ranked[1] ?? null;
    const best = ranked.length
      ? Math.min(...ranked.map((o) => o.organic_rank as number))
      : null;
    return {
      target_id: target.id,
      site_id: target.site_id,
      site_name: site?.name ?? null,
      site_domain: site?.domain ?? null,
      brand_id: site?.brand_id ?? null,
      keyword: keywordById.get(target.keyword_id) ?? target.keyword_id,
      engine: target.engine,
      device: target.device,
      search_type: target.search_type,
      tracking_label: describeTracking(target.engine, target.search_type),
      is_active: target.is_active,
      created_at: target.created_at,
      latest_position: latest?.organic_rank ?? null,
      previous_position: previous?.organic_rank ?? null,
      movement:
        latest?.organic_rank != null && previous?.organic_rank != null
          ? previous.organic_rank - latest.organic_rank
          : null,
      best_position: best,
      last_checked_at: newestFirst[0]?.observed_at ?? null,
      history: [...newestFirst].reverse(),
    };
  });
}
