import type { Database } from "@/types/database.types";
import type {
  KeywordResearchResult,
  KeywordVolumeRefreshResult,
} from "@/types/python-generated/stream-events";

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

/** Streamed via the `seo.research_completed` data event — the routes stream
 * NDJSON, so these live in stream-events.ts, not the OpenAPI api-types. */
export type KeywordResearchResponse = KeywordResearchResult;
export type KeywordVolumeRefreshResponse = KeywordVolumeRefreshResult;

export const US_LOCATION_CODE = 2840;
