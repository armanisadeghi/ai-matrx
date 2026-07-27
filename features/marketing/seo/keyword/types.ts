/**
 * Canonical keyword primitive — shared types.
 *
 * THE RULE THIS MODULE EXISTS FOR: a keyword must never appear anywhere in
 * the product as a bare string. Wherever a keyword is entered, displayed, or
 * handed to an agent, it travels with everything the platform knows about it
 * (seo.keyword + keyword_market + edges + site performance + rank evidence),
 * condensed appropriately for the consumer.
 *
 * Entry points:
 * - `KeywordInput`   — the canonical input shell (resolution, chips, suggestions,
 *                      intelligence-window launcher).
 * - `KeywordIntelPanel` / the `keywordWindow` overlay — the full tabbed
 *   keyword intelligence surface, openable from anywhere via
 *   `useOpenKeywordWindow` (features/overlays/openers/keywordWindow.tsx).
 * - `buildKeywordBrief` — the condensed keyword+data payload for AI/agent/copy
 *   consumers.
 */

import type {
  KeywordMarketRow,
  KeywordWithMarket,
} from "@/features/marketing/seo/keyword-research/types";

/** Where the keyword is being used — every id is optional so the primitive
 * works site-less (e.g. the global tools grid) and gets smarter as context
 * is supplied. */
export interface KeywordScope {
  organizationId?: string | null;
  siteId?: string | null;
  pageId?: string | null;
  brandId?: string | null;
}

/** A contextual suggestion a caller feeds the input (page GSC queries, the
 * Page Analyzer's inferred keywords, sibling-page keywords, …). */
export interface KeywordSuggestion {
  phrase: string;
  /** Where this candidate came from — rendered as a small source tag. */
  source: "library" | "gsc" | "analyzer";
  /** One short human line ("240 impressions · pos 12.4", "supporting"). */
  detail?: string;
}

/** The resolved identity of a phrase against the universal keyword plane. */
export interface ResolvedKeyword {
  /** The library row (with embedded market rows), or null when the phrase is
   * not in `seo.keyword` yet. */
  keyword: KeywordWithMarket | null;
  /** The freshest market row (US preferred), or null. */
  market: KeywordMarketRow | null;
}

/** One aggregated Search Console query row for a page (evidence that real
 * searches already reach this URL). */
export interface PageQueryStat {
  query: string;
  clicks: number;
  impressions: number;
  /** Impression-weighted average position, null when impressions are 0. */
  position: number | null;
}

/** Panel tabs — also the persisted `activeTab` vocabulary. */
export type KeywordIntelTab =
  | "overview"
  | "relationships"
  | "site"
  | "rankings"
  | "serp"
  | "research";

export const KEYWORD_INTEL_TABS: KeywordIntelTab[] = [
  "overview",
  "relationships",
  "site",
  "rankings",
  "serp",
  "research",
];

export function isKeywordIntelTab(value: unknown): value is KeywordIntelTab {
  return (
    typeof value === "string" &&
    (KEYWORD_INTEL_TABS as string[]).includes(value)
  );
}
