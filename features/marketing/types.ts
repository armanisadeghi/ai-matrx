import type { Database, Json } from "@/types/database.types";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";

type WebTables = Database["web"]["Tables"];
type WebViews = Database["web"]["Views"];

export type MarketingSite = WebTables["site"]["Row"];
export type MarketingBrand = WebTables["brand"]["Row"];
export type BrandProperty = WebTables["property"]["Row"];
export type BrandAsset = WebTables["brand_asset"]["Row"];
export type BusinessFact = WebTables["business_fact"]["Row"];
export type DiscoveredItem = WebTables["discovered_item"]["Row"];
export type SiteScreenshot = WebTables["screenshot"]["Row"];
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

export interface HomepageObservedMeta {
  pageId: string;
  metaTitle: string | null;
  metaDescription: string | null;
  capturedAt: string;
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

export interface UpdateSiteIdentityInput {
  siteId: string;
  expectedVersion: number;
  patch: Partial<
    Pick<
      MarketingSite,
      "name" | "description" | "logo_url" | "favicon_url" | "og_image_url"
    >
  >;
}

export type DiscoveredItemStatus = "pending" | "confirmed" | "dismissed";

/** Confirm a discovered item as a brand asset. */
export interface ConfirmAssetInput {
  item: DiscoveredItem;
  assetKind: BrandAsset["kind"];
  title: string | null;
}

/** Confirm a discovered item as a business fact. */
export interface ConfirmFactInput {
  item: DiscoveredItem;
  factKind: BusinessFact["kind"];
  label: string | null;
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
