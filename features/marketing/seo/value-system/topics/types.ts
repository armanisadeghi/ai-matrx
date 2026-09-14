/**
 * Keyword placement backfill — the server-state shapes the placement strip and
 * the run console render.
 *
 * Everything else that lived here described the legacy `seo.topic` offering
 * tree, replaced by the Offerings screen (brand-offerings cutover step 6;
 * `features/marketing/seo/value-system/offerings/`, vocabulary in its
 * `vocabulary.ts`).
 */

/**
 * `seo.topic_placement_status` — the ONE server-state read the placement strip
 * renders. Clicks first: 8,455 keywords and 457 clicks are both true numbers,
 * and only one of them describes the business.
 */
export interface TopicPlacementStatus {
  demand_keywords: number;
  demand_keywords_placed: number;
  demand_clicks: number;
  demand_clicks_placed: number;
  demand_impressions: number;
  demand_impressions_placed: number;
  placed_by_human: number;
  placed_by_agent: number;
  proposals_pending: number;
  proposal_clicks: number;
  queue_pending: number;
  queue_running: number;
  queue_failed: number;
  queue_deferred: number;
  pending_clicks: number;
  next_phrase: string | null;
  last_error: string | null;
  demand_window_days: number | null;
  demand_as_of: string | null;
  queue_refreshed_at: string | null;
  last_placed_at: string | null;
}

/** What one bounded placement pass did — aidream's `PlacementPassResult`. */
export interface TopicPlacementPassResult {
  site_id: string;
  territory: string;
  claimed: number;
  placed: number;
  proposed: number;
  human_protected: number;
  topics_created: string[];
  returned_to_queue: number;
  quarantined: number;
  placed_today: number;
  daily_ceiling: number;
  ceiling_reached: boolean;
  queue_pending: number;
  queue_deferred: number;
  pending_clicks: number;
  confidence_floor: number;
  error: string | null;
  top_phrases: string[];
  /**
   * KI-044 — which autonomy mode the pass obeyed. A decision other than
   * `apply` means nothing was PLACED: either the assigner is off (`skipped`),
   * or every placement is waiting for a person as a proposal (the SAME
   * proposal queue low-confidence placements already use — the mode raises the
   * confidence floor above the maximum rather than opening a second path).
   */
  autonomy_mode?: string;
  autonomy_decision?: string;
  autonomy_refusal?: string | null;
  timeout_applied?: number;
  skipped?: string | null;
}
