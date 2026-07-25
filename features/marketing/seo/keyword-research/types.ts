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

// ─── `seo` tool (action=keyword_data) result shapes ─────────────────────────
//
// Backend source of truth: aidream
// `packages/matrx-ai/matrx_ai/tools/output_models/seo.py` (SeoKeywordDataOutput),
// which already normalizes DataForSEO nulls to typed defaults — so these
// fields are present, never null.

/** One keyword row as the `seo` tool returns it (already normalized server-side). */
export interface SeoKeywordDatum {
  keyword: string;
  cpc: number;
  competition: string;
  search_volume: number;
  competition_index: number;
  monthly_searches: MonthlySearchPoint[];
}

/** `seo` action=keyword_data envelope. */
export interface SeoKeywordDataResult {
  keywords_data: SeoKeywordDatum[];
  total_keywords: number;
  date_range: { from?: string; to?: string };
  search_parameters: { location_code?: number; language_code?: string };
}

/**
 * Defensive read of a keyword-data payload — the tool result arrives as
 * untyped JSON, so every field is re-checked rather than trusted.
 */
export function parseSeoKeywordData(
  raw: Record<string, unknown> | null,
): SeoKeywordDataResult | null {
  if (!raw || !Array.isArray(raw.keywords_data)) return null;
  const keywords_data = raw.keywords_data
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      keyword: typeof item.keyword === "string" ? item.keyword : "",
      cpc: typeof item.cpc === "number" ? item.cpc : 0,
      competition: typeof item.competition === "string" ? item.competition : "",
      search_volume:
        typeof item.search_volume === "number" ? item.search_volume : 0,
      competition_index:
        typeof item.competition_index === "number" ? item.competition_index : 0,
      monthly_searches: normalizeMonthlySearches(item.monthly_searches),
    }))
    .filter((item) => item.keyword.length > 0);
  if (!keywords_data.length) return null;

  const range = (raw.date_range ?? {}) as Record<string, unknown>;
  const params = (raw.search_parameters ?? {}) as Record<string, unknown>;
  return {
    keywords_data,
    total_keywords:
      typeof raw.total_keywords === "number"
        ? raw.total_keywords
        : keywords_data.length,
    date_range: {
      from: typeof range.from === "string" ? range.from : undefined,
      to: typeof range.to === "string" ? range.to : undefined,
    },
    search_parameters: {
      location_code:
        typeof params.location_code === "number"
          ? params.location_code
          : undefined,
      language_code:
        typeof params.language_code === "string"
          ? params.language_code
          : undefined,
    },
  };
}

/**
 * Coerce any `monthly_searches` blob (tool payload or the `keyword_market`
 * JSONB column) into typed points. Order is preserved as received.
 */
export function normalizeMonthlySearches(raw: unknown): MonthlySearchPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (point): point is Record<string, unknown> =>
        !!point && typeof point === "object" && !Array.isArray(point),
    )
    .filter((point) => typeof point.search_volume === "number")
    .map((point) => ({
      year: typeof point.year === "number" ? point.year : 0,
      month: typeof point.month === "number" ? point.month : 0,
      search_volume: point.search_volume as number,
    }));
}
