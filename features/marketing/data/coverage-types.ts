import type { Database } from "@/types/database.types";

/**
 * One saved search — what this site watches, and which rivals it watches
 * alongside itself so share-of-voice has a denominator. Written by the server
 * (a human through `/coverage/trackers`, or WP2/WP3 through IC-8); this client
 * only reads.
 *
 * Since aidream migration 1411 a tracker is the ONE news monitor record with
 * `lenses` (`coverage` and/or `opportunity`). A coverage tracker always has a
 * `site_id` and a `brand_key`; an opportunity-only monitor may have neither
 * (it is read through its organization, `parent_organization_id` — aidream
 * migration 1411c), which is why both are nullable here.
 */
export type CoverageTrackerRow =
  Database["seo"]["Tables"]["coverage_tracker"]["Row"];

/**
 * One article that mentioned the brand (or a tracked rival). Discovery is
 * GDELT; everything with weight — byline, publication date, whether the piece
 * links to us, the sentiment/prominence/topics — comes from a page OUR OWN
 * crawler read. `capture_status` says which of those two states a row is in,
 * and NULL analysis fields mean unmeasured, never zero.
 */
export type CoverageMentionRow =
  Database["seo"]["Tables"]["coverage_mention"]["Row"];

export type CoverageCaptureStatus =
  | "pending"
  | "captured"
  | "failed"
  | "blocked"
  | "skipped";

export type CoverageSentiment = "positive" | "neutral" | "negative" | "mixed";
export type CoverageProminence = "headline" | "lede" | "body" | "passing";

/**
 * Brand vs each tracked competitor over ONE window.
 *
 * Computed here from the SAME rows the feed renders — the server twin
 * (`matrx_seo.coverage.share_of_voice`) exists for server consumers (exports,
 * agents) and uses the identical definition: a bucket's mentions over the
 * tracked total. There is no stored rollup anywhere, so a percentage and the
 * list underneath it cannot disagree.
 */
export interface CoverageVoiceShare {
  key: string;
  label: string;
  mentions: number;
  sharePct: number;
  linkedMentions: number;
  avgHitScore: number | null;
  isBrand: boolean;
}

export interface CoverageShareOfVoice {
  totalMentions: number;
  entries: CoverageVoiceShare[];
  brandSharePct: number;
}

export interface CoverageSummary {
  total: number;
  brandMentions: number;
  linked: number;
  analyzed: number;
  awaitingCapture: number;
  blocked: number;
  avgHitScore: number | null;
  credited: number;
}

export interface CoveragePagedResult {
  rows: CoverageMentionRow[];
  total: number;
}

/**
 * One story a news monitor decided (NEWS-ENGINE-SPEC §5.3) — per-monitor state,
 * written by the engine's commit step and, for surface-anyway / undo / dismiss,
 * by a person directly under the table's RLS. The row carries its own display
 * `evidence` (≤8), so no story screen ever reads `web.news_item` (guard:
 * `features/marketing/news-monitor/__tests__/no-news-item-join.test.ts`).
 */
export type TrackerStoryRow = Database["seo"]["Tables"]["tracker_story"]["Row"];

/** The reasons a person may give for dismissing a story (the table's CHECK). */
export const STORY_DISMISS_REASONS = [
  "off_beat",
  "not_news",
  "wrong_entity",
  "already_known",
  "off_policy",
  "other",
] as const;
export type StoryDismissReason = (typeof STORY_DISMISS_REASONS)[number];
