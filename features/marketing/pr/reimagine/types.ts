/**
 * The Newsroom Desk — row types.
 *
 * Every type here is either (a) the GENERATED Supabase row type, unwidened, or
 * (b) a derived view type computed from those rows. Nothing hand-mirrors a
 * column. When the real Supabase reads land, `DeskData` is what the query
 * returns and every component below it keeps working untouched.
 */

import type { Database } from "@/types/database.types";

export type StoryAngleRow = Database["seo"]["Tables"]["story_angle"]["Row"];
export type SourceRequestRow =
  Database["seo"]["Tables"]["source_request"]["Row"];
export type CoverageMentionRow =
  Database["seo"]["Tables"]["coverage_mention"]["Row"];

/**
 * The desk is an AGENCY surface: one operator, several client businesses.
 * Rows carry only `site_id`, so the brand label/door is resolved from the
 * site context the workspace already loads (`useMarketingSite` in the
 * site-scoped variants; a fixture map here).
 */
export interface DeskSite {
  siteId: string;
  brandId: string | null;
  brandName: string;
  domain: string;
  /** `coverage_mention.brand_key` — the join coverage rows actually carry. */
  brandKey: string;
}

export type DeskItemKind = "angle" | "request" | "coverage";

export type DeskItem =
  | { kind: "angle"; id: string; siteId: string; row: StoryAngleRow }
  | { kind: "request"; id: string; siteId: string | null; row: SourceRequestRow }
  | { kind: "coverage"; id: string; siteId: string; row: CoverageMentionRow };

export type DeskLane = "all" | "proof" | "deadline" | "pitch" | "landed";

export type DeskSort =
  | "next-up"
  | "deadline"
  | "newsworthy"
  | "nearly-provable"
  | "recent";

/** What the workspace query resolves to. Shape is deliberately query-ready. */
export interface DeskData {
  angles: StoryAngleRow[];
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
  sites: DeskSite[];
  /** `max(story_angle.analyzed_at)` — drives the staleness banner. */
  lastAnalyzedAt: string | null;
}

export type DeskQueryStatus = "loading" | "error" | "ready";
