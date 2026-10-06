// features/marketing/seo/domain-research/types.ts — the `data` of each
// `seo_domain` action's envelope, as aidream's
// `aidream/services/seo/domain_reads.py` builds it. Every figure the provider
// did not give is `null` (unknown), never 0.

export type DomainAction =
  | "overview"
  | "ranked_keywords"
  | "serp_competitors"
  | "keyword_gap";

export const DOMAIN_ACTIONS: readonly DomainAction[] = [
  "overview",
  "ranked_keywords",
  "serp_competitors",
  "keyword_gap",
];

export interface DomainMarket {
  location_code: number;
  language_code: string;
  provider?: string;
  defaulted?: boolean;
}

export interface DomainOverviewData {
  domain: string;
  scope: string;
  organic_traffic_est: number | null;
  organic_keywords: number | null;
  paid_keywords: number | null;
  backlinks: number | null;
  referring_domains: number | null;
  backlinks_source: "stored_backlink_summary" | "dataforseo_backlinks_summary" | null;
  backlinks_as_of: string | null;
  market: DomainMarket;
  as_of: string | null;
  estimate_notice?: string;
}

export interface RankedKeywordRow {
  keyword: string | null;
  url: string | null;
  position: number | null;
  absolute_rank: number | null;
  search_volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  provider_intent: string | null;
  traffic_estimate: number | null;
}

export interface RankedKeywordsData {
  target: string;
  scope: string;
  rows: RankedKeywordRow[];
  total_count: number | null;
  brand_terms_subtracted: string[];
  brand_terms_source: "caller" | "brand_aliases" | "competitor_name" | "domain_name";
  market: DomainMarket;
  as_of: string | null;
}

export interface SerpCompetitorRow {
  domain: string | null;
  avg_position: number | null;
  visibility: number | null;
  keywords_count: number | null;
  etv: number | null;
}

export interface SerpCompetitorsData {
  keywords: string[];
  rows: SerpCompetitorRow[];
  market: DomainMarket;
  as_of: string | null;
}

export interface KeywordGapRow {
  keyword: string | null;
  their_position: number | null;
  their_url: string | null;
  our_position: number | null;
  search_volume: number | null;
  difficulty: number | null;
}

export interface KeywordGapData {
  target: string;
  competitor: string;
  gap: "they_rank_we_dont" | "both";
  rows: KeywordGapRow[];
  total_count: number | null;
  market: DomainMarket;
  as_of: string | null;
}

export interface DomainActionData {
  overview: DomainOverviewData;
  ranked_keywords: RankedKeywordsData;
  serp_competitors: SerpCompetitorsData;
  keyword_gap: KeywordGapData;
}
