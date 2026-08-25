/**
 * Topic Tree Builder — types + the ROOT-TYPE vocabulary in business language.
 *
 * The root type is the whole point of the tree. `seo.keyword_value_map` walks
 * a keyword's primary topic upward and reports the TOPMOST ancestor's
 * `node_type` as the keyword's `root`. That one word answers Arman's question:
 * can this traffic ever become money, or is it only ever authority?
 */

import type { Database } from "@/types/database.types";

export interface TopicStatRow {
  topic_id: string;
  value_band: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

export interface OfferingSplitRow {
  bucket: "offering" | "authority" | "unassigned";
  root_type: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

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

export interface KeywordTopicResult {
  keyword_id: string;
  value_band: string;
  value_source: string;
  value_score: number | null;
}

/** Exact generated contract for the global impact preview shown before delete. */
export type TopicDeleteImpact =
  Database["seo"]["Functions"]["gsc_topic_delete_impact"]["Returns"][number];

/** Exact generated contract for the atomic delete/reassignment result. */
export type TopicDeleteResult =
  Database["seo"]["Functions"]["gsc_topic_delete"]["Returns"][number];

/**
 * THE MISMATCH RULE (USER.md): the person choosing this is a subject-matter
 * expert in their business, not in SEO taxonomy. So every option is written as
 * a sentence about their money, never as a schema label.
 */
export interface RootTypeMeta {
  value: string;
  label: string;
  /** What choosing this MEANS for the money. */
  meaning: string;
  /** True when traffic under this root can become a customer. */
  offering: boolean;
}

export const ROOT_TYPE_META: RootTypeMeta[] = [
  {
    value: "service",
    label: "A service you sell",
    meaning: "Traffic under here can become a paying customer.",
    offering: true,
  },
  {
    value: "product",
    label: "A product you sell",
    meaning: "Traffic under here can become a paying customer.",
    offering: true,
  },
  {
    value: "problem",
    label: "A problem you get paid to solve",
    meaning:
      "Someone searching their problem is shopping for your answer — this can become money.",
    offering: true,
  },
  {
    value: "audience",
    label: "A group of people you sell to",
    meaning:
      "The searcher is the kind of buyer you want — this can become money.",
    offering: true,
  },
  {
    value: "brand",
    label: "Your name or your brand",
    meaning:
      "People looking for you by name — the closest traffic to a sale there is.",
    offering: true,
  },
  {
    value: "authority",
    label: "Authority only — it will never sell anything",
    meaning:
      "Real traffic that builds your site's standing, and nothing more. An SEO company growing only this is not growing your revenue.",
    offering: false,
  },
  {
    value: "existing_customer",
    label: "People who already bought from you",
    meaning:
      "Support and account traffic. Worth serving well, never counted as new business.",
    offering: false,
  },
  {
    value: "recruiting",
    label: "People looking for a job",
    meaning: "Useful for hiring. It is not customer demand.",
    offering: false,
  },
  {
    value: "reputation",
    label: "People checking you out",
    meaning:
      "Reviews, complaints, is-this-legit searches. Reputation work, not acquisition.",
    offering: false,
  },
  {
    value: "partner",
    label: "Partners, vendors, and suppliers",
    meaning: "Business-to-business relationships, not buyers.",
    offering: false,
  },
];

export function rootTypeMeta(
  nodeType: string | null | undefined,
): RootTypeMeta {
  return (
    ROOT_TYPE_META.find((meta) => meta.value === nodeType) ?? {
      value: nodeType ?? "unknown",
      label: nodeType ?? "Not set",
      meaning:
        "This type is not in the vocabulary — the tree cannot say what it is worth.",
      offering: false,
    }
  );
}

/** `seo.site_topic_value.lead_quality` — the site's own words for it. */
export const LEAD_QUALITY_OPTIONS = [
  { value: "high_value", label: "The leads we want most" },
  { value: "medium_value", label: "Decent leads" },
  { value: "low_value", label: "Weak leads" },
  {
    value: "negative_value",
    label: "Leads we do not want",
    guard: true,
  },
] as const;

/** `seo.site_topic_value.offering_match`. */
export const OFFERING_MATCH_OPTIONS = [
  { value: "core_offering", label: "This is what we do" },
  { value: "adjacent_offering", label: "Near what we do" },
  { value: "not_offered", label: "We do not offer this", guard: true },
  { value: "actively_avoided", label: "We turn this work away", guard: true },
] as const;

/** The two rulings that force a keyword's band to Negative regardless of arithmetic. */
export function isNegativeGuard(
  leadQuality: string | null,
  offeringMatch: string | null,
): boolean {
  return (
    leadQuality === "negative_value" ||
    offeringMatch === "not_offered" ||
    offeringMatch === "actively_avoided"
  );
}
