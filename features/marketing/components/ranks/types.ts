/**
 * Rank tracking (WS-10 / M-34..M-37) — wire types for
 * `aidream/services/seo/rank_tracking.py`. New backend routes (see
 * `useRanks.ts`), not yet regenerated into `api-types.ts` — hand-typed here
 * until the deploy sync runs.
 */

import type { SeoCollectionReceipt } from "@/features/seo/rank/types";

export type RankProvider = "brave" | "serpapi";

export interface RankPortfolioItem {
  target_id: string;
  site_id: string;
  keyword_id: string;
  keyword: string;
  provider: string;
  engine: string;
  language: string;
  device: string;
  target_domain: string | null;
  target_page_id: string | null;
  group: string | null;
  tags: string[];
  notes: string | null;
  cadence_days: number;
  is_active: boolean;
  created_at: string;
  latest_position: number | null;
  latest_absolute_position: number | null;
  previous_position: number | null;
  movement: number | null;
  best_position: number | null;
  last_checked_at: string | null;
}

export interface RankTargetHistoryPoint {
  observed_at: string;
  organic_rank: number | null;
  absolute_rank: number | null;
  matched_url: string | null;
  matched_domain: string | null;
  result_type: string;
}

export interface SerpLandscapeResult {
  absolute_rank: number;
  organic_rank: number | null;
  result_type: string;
  url: string | null;
  domain: string | null;
  title: string | null;
  snippet: string | null;
}

export interface SerpLandscape {
  snapshot_id: string | null;
  observed_at: string | null;
  results: SerpLandscapeResult[];
}

export interface AddRankTargetInput {
  keyword: string;
  provider: RankProvider;
  language?: string;
  device?: "desktop" | "mobile";
  country?: string;
  target_page_id?: string | null;
  group?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  cadence_days?: number;
  location_name?: string | null;
}

export interface UpdateRankTargetInput {
  is_active?: boolean;
  group?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  cadence_days?: number;
}

export interface RankCheckCompletedEvent {
  kind: "seo.rank_check_completed";
  run_id: string;
  /** Canonical shape — shared with the `seo` tool's collect_rank result. */
  receipt: SeoCollectionReceipt;
  portfolio_item: RankPortfolioItem | null;
}
