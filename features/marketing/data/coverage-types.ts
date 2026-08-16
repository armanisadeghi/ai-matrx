import type { Database } from "@/types/database.types";

/**
 * One saved search — what this site watches, and which rivals it watches
 * alongside itself so share-of-voice has a denominator. Written by the server
 * (a human through `/coverage/trackers`, or WP2/WP3 through IC-8); this client
 * only reads.
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
