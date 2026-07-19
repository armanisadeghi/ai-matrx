import type { Database, Json } from "@/types/database.types";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";

type WebTables = Database["web"]["Tables"];
type WebViews = Database["web"]["Views"];

export type MarketingSite = WebTables["site"]["Row"];
export type MarketingPage = WebTables["page"]["Row"];
export type CrawlSession = WebTables["crawl_session"]["Row"];
export type PageSnapshot = WebTables["snapshot"]["Row"];
export type CrawlUrl = WebTables["crawl_url"]["Row"];
export type CrawlEvent = WebTables["crawl_event"]["Row"];
export type PageUpdate = WebTables["page"]["Update"];
export type SiteScore = WebViews["v_site_score"]["Row"];
export type PageScore = WebViews["v_page_score"]["Row"];

export interface PagedResult<T> {
  rows: T[];
  total: number;
}

export interface SiteListRow extends MarketingSite {
  health_score: number | null;
  scored_pages: number;
}

export interface PageListRow extends MarketingPage {
  latest_score: number | null;
  fail_count: number;
}

export interface SiteOverviewMetrics {
  siteScore: number | null;
  scoredPages: number;
  canonicalPages: number;
  openFindings: number;
  snapshots: number;
  latestCrawl: CrawlSession | null;
}

export interface PageWorkspaceData {
  page: MarketingPage;
  latestSnapshot: PageSnapshot | null;
  score: number | null;
  failCount: number;
  openFindings: number;
}

export interface CreateSiteInput {
  organizationId: string;
  name: string;
  rootUrl: string;
  domain: string;
}

export interface UpdatePageIntentInput {
  siteId: string;
  pageId: string;
  expectedVersion: number;
  targetKeyword: string | null;
  desiredMetaTitle: string | null;
  desiredMetaDescription: string | null;
}

export interface MarketingTableStateOptions {
  defaultSort: NonNullable<MatrxDataTableQueryState["sort"]>;
  defaultPageSize?: number;
}

export function isJsonRecord(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
