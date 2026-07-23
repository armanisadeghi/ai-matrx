import type { Database } from "@/types/database.types";
import type { components } from "@/types/python-generated/api-types";

export type KeywordRow = Database["seo"]["Tables"]["keyword"]["Row"];
export type KeywordMarketRow =
  Database["seo"]["Tables"]["keyword_market"]["Row"];
export type KeywordEdgeRow = Database["seo"]["Tables"]["keyword_edge"]["Row"];
export type SiteKeywordPerformanceRow =
  Database["seo"]["Views"]["v_site_keyword_performance"]["Row"];

export interface SiteKeywordPerformancePage {
  rows: SiteKeywordPerformanceRow[];
  total: number;
}

/** One explorer row: the universal keyword plus its US market cache (if fetched). */
export interface KeywordWithMarket extends KeywordRow {
  keyword_market: KeywordMarketRow[];
}

export interface MonthlySearchPoint {
  year: number;
  month: number;
  search_volume: number;
}

/** An edge annotated with the partner keyword's phrase and direction. */
export interface KeywordEdgeView {
  id: string;
  edge_type: string;
  status: string;
  origin: string;
  confidence: number | null;
  direction: "outgoing" | "incoming";
  partner_keyword_id: string;
  partner_phrase: string;
}

export type KeywordResearchResponse =
  components["schemas"]["KeywordResearchResult"];
export type KeywordVolumeRefreshResponse =
  components["schemas"]["KeywordVolumeRefreshResult"];

export const US_LOCATION_CODE = 2840;
