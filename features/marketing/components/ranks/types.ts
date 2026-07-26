/**
 * Rank tracking (WS-10 / M-34..M-37) — wire types for
 * `aidream/services/seo/rank_tracking.py`. New backend routes (see
 * `useRanks.ts`), not yet regenerated into `api-types.ts` — hand-typed here
 * until the deploy sync runs.
 */

import type { SeoCollectionReceipt } from "@/features/marketing/seo/rank/types";

export type RankProvider = "brave" | "serpapi" | "dataforseo";
export type AiAnswerEngine = "chat_gpt" | "perplexity" | "gemini" | "claude";

/** One user-facing tracking mode — composes provider + engine + search_type. */
export interface TrackingModeOption {
  id: string;
  label: string;
  provider: RankProvider;
  engine?: AiAnswerEngine;
  search_type: "organic" | "local_pack" | "ai_answer";
  location: "required" | "optional" | "none";
  hint: string;
}

export const TRACKING_MODES: TrackingModeOption[] = [
  { id: "google_national", label: "Google — National", provider: "serpapi", search_type: "organic", location: "none",
    hint: "Country-level Google organic rankings (no city bias)." },
  { id: "google_location", label: "Google — Local area", provider: "serpapi", search_type: "organic", location: "required",
    hint: "Google organic rankings as seen from a specific city." },
  { id: "google_local_pack", label: "Google — Map pack", provider: "serpapi", search_type: "local_pack", location: "required",
    hint: "Position in the Google local 3-pack for a place." },
  { id: "brave", label: "Brave", provider: "brave", search_type: "organic", location: "none",
    hint: "Brave's own index (country-level)." },
  { id: "ai_chat_gpt", label: "ChatGPT (AI answers)", provider: "dataforseo", engine: "chat_gpt", search_type: "ai_answer", location: "optional",
    hint: "Runs the prompt through ChatGPT with web search; tracks whether you are cited or mentioned." },
  { id: "ai_perplexity", label: "Perplexity (AI answers)", provider: "dataforseo", engine: "perplexity", search_type: "ai_answer", location: "optional",
    hint: "Citation + mention tracking in Perplexity answers." },
  { id: "ai_gemini", label: "Gemini (AI answers)", provider: "dataforseo", engine: "gemini", search_type: "ai_answer", location: "optional",
    hint: "Citation + mention tracking in Gemini answers." },
  { id: "ai_claude", label: "Claude (AI answers)", provider: "dataforseo", engine: "claude", search_type: "ai_answer", location: "optional",
    hint: "Citation + mention tracking in Claude answers." },
];

export interface RankPortfolioItem {
  target_id: string;
  site_id: string;
  keyword_id: string;
  keyword: string;
  provider: string;
  engine: string;
  language: string;
  device: string;
  search_type: string;
  location_name: string | null;
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
  search_type?: "organic" | "local_pack" | "ai_answer";
  engine?: AiAnswerEngine | null;
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
