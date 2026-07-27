/**
 * Rank tracking (WS-10 / M-34..M-37) — wire types for
 * `aidream/services/seo/rank_tracking.py`. The generated OpenAPI bundle now
 * carries these routes, so every wire shape is an alias of
 * `types/python-generated/api-types.ts` (the source of truth — never
 * hand-mirror). Only the shapes genuinely absent from the OpenAPI bundle
 * stay hand-typed below (each one says why).
 */

import type { components } from "@/types/python-generated/api-types";
import type { SeoCollectionReceipt } from "@/features/marketing/seo/rank/types";

/** Portfolio row — `GET/POST /seo/sites/{site_id}/rank-targets`. */
export type RankPortfolioItem = components["schemas"]["RankPortfolioItem"];
/** Add-target body — `POST /seo/sites/{site_id}/rank-targets`. */
export type AddRankTargetInput = components["schemas"]["RankTargetAddBody"];
/** Patch body — `PATCH /seo/rank-targets/{target_id}`. */
export type UpdateRankTargetInput = components["schemas"]["RankTargetPatchBody"];
/** `DELETE /seo/rank-targets/{target_id}` response. */
export type RankTargetRemovedResponse =
  components["schemas"]["RankTargetRemovedResponse"];
/** `GET /seo/rank-targets/{target_id}/history` row. */
export type RankTargetHistoryPoint =
  components["schemas"]["RankTargetHistoryPoint"];
/** `GET /seo/rank-targets/{target_id}/landscape` response. */
export type SerpLandscape = components["schemas"]["SerpLandscape"];
export type SerpLandscapeResult = components["schemas"]["SerpLandscapeResult"];

// ---------------------------------------------------------------------------
// Hand-typed remainder — NOT in the OpenAPI bundle:
// - RankProvider / AiAnswerEngine: the API models `provider` / `engine` as
//   plain `string`; these unions are the FE-side vocabulary the UI offers.
// - TrackingModeOption / TRACKING_MODES: frontend-only UI composition of
//   provider + engine + search_type into user-facing tracking modes.
// - RankCheckCompletedEvent: an in-band stream event payload on
//   `POST /seo/rank-targets/{target_id}/check` — stream event shapes are not
//   emitted into the OpenAPI schema set.
// ---------------------------------------------------------------------------

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

export interface RankCheckCompletedEvent {
  kind: "seo.rank_check_completed";
  run_id: string;
  /** Canonical shape — shared with the `seo` tool's collect_rank result. */
  receipt: SeoCollectionReceipt;
  portfolio_item: RankPortfolioItem | null;
}
