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
export type SiteSitemap = WebTables["sitemap"]["Row"];
export type PageSitemapMembership = WebTables["page_sitemap"]["Row"];

/** One sitemap-membership row joined with its canonical page, plus how many
 *  sitemaps that page appears in (1 = only this one). */
export interface SitemapPageRow extends PageSitemapMembership {
  page: Pick<
    MarketingPage,
    | "id"
    | "url"
    | "path"
    | "status"
    | "provenance"
    | "http_status_last"
    | "latest_snapshot_id"
    | "last_seen"
  >;
  membership_count: number;
}

export interface SitemapCoverage {
  sitemaps: number;
  pagesInSitemaps: number;
  neverCrawled: number;
  lastSyncedAt: string | null;
}
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

export interface BrandListRow extends MarketingBrand {
  sites: Array<
    Pick<
      MarketingSite,
      | "id"
      | "brand_id"
      | "name"
      | "domain"
      | "favicon_url"
      | "logo_url"
      | "initialized_at"
    >
  >;
  pending_discovered: number;
  social_count: number;
  asset_count: number;
  fact_count: number;
}

/**
 * The human-authored editorial brand profile stored in `web.brand.profile`
 * (jsonb, default `{}`). Flat by design: every field is an optional string or
 * string array. This is the voice-of-the-client document downstream agents
 * rely on — humans author it; agents only propose changes.
 */
export interface BrandProfile {
  audience?: string;
  voice_tone?: string;
  positioning?: string;
  value_props?: string[];
  offerings?: string[];
  service_area?: string;
  competitors?: string[];
  target_keywords?: string[];
  content_guidelines?: string;
  notes?: string;
}

const BRAND_PROFILE_STRING_FIELDS = [
  "audience",
  "voice_tone",
  "positioning",
  "service_area",
  "content_guidelines",
  "notes",
] as const;

const BRAND_PROFILE_LIST_FIELDS = [
  "value_props",
  "offerings",
  "competitors",
  "target_keywords",
] as const;

/**
 * Safely narrow raw `web.brand.profile` jsonb into a `BrandProfile`. Never
 * throws; non-conforming fields are dropped, empty strings/lists omitted.
 */
export function parseBrandProfile(raw: Json | null | undefined): BrandProfile {
  if (raw === null || raw === undefined || !isJsonRecord(raw)) return {};
  const profile: BrandProfile = {};
  for (const key of BRAND_PROFILE_STRING_FIELDS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) profile[key] = value.trim();
  }
  for (const key of BRAND_PROFILE_LIST_FIELDS) {
    const value = raw[key];
    if (!Array.isArray(value)) continue;
    const items = value.flatMap((entry) =>
      typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
    );
    if (items.length) profile[key] = items;
  }
  return profile;
}

/** Serialize a `BrandProfile` for the `web.brand.profile` jsonb column. */
export function brandProfileToJson(profile: BrandProfile): Json {
  const record: { [key: string]: Json } = {};
  for (const key of BRAND_PROFILE_STRING_FIELDS) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) record[key] = value.trim();
  }
  for (const key of BRAND_PROFILE_LIST_FIELDS) {
    const value = profile[key];
    if (Array.isArray(value) && value.length) record[key] = value;
  }
  return record;
}

/** Every user-editable brand field. If it's editable, it's HERE and in the editor. */
export interface CreateBrandInput {
  organizationId: string;
  name: string;
  industry: string | null;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  notes: string | null;
  status: string;
  /**
   * Omit to inherit the registry default
   * (`platform.entity_types.default_visibility` for `web_brand`, applied by
   * the DB column default). Pass only a deliberate user choice.
   */
  visibility?: MarketingBrand["visibility"];
  /** Serialized `BrandProfile` (via `brandProfileToJson`); omit for `{}`. */
  profile?: Json;
}

export interface UpdateBrandInput {
  brandId: string;
  expectedVersion: number;
  patch: Partial<
    Pick<
      MarketingBrand,
      | "name"
      | "industry"
      | "description"
      | "website_url"
      | "logo_url"
      | "favicon_url"
      | "og_image_url"
      | "notes"
      | "status"
      | "visibility"
      | "profile"
    >
  >;
}

export interface SiteListRow extends MarketingSite {
  health_score: number | null;
  scored_pages: number;
  /** Canonical live PAGES — excludes crawled non-HTML resources. */
  page_count: number;
  /** Live non-HTML registry rows (image/json/xml/pdf/…), excluded from `page_count`. */
  resource_count: number;
  /** Distinct pages Google Search Console has ever reported for the site. */
  pages_in_gsc: number;
  /** 28-day GSC click sum; null when Google has no data in the window. */
  gsc_clicks_28d: number | null;
  /** 28-day GSC impression sum; null when Google has no data in the window. */
  gsc_impressions_28d: number | null;
  /** Impression-weighted 28-day average position; null without data. */
  gsc_position_28d: number | null;
  /** Prior 28-day click sum (days 29-56); null when that window is empty. */
  gsc_clicks_prev_28d: number | null;
  /** Prior 28-day impression sum; null when that window is empty. */
  gsc_impressions_prev_28d: number | null;
  /** Distinct dates with GSC data in the prior window — deltas render only
   *  when this is near-complete, so partial history never fakes a trend. */
  gsc_prev_days: number;
  /** Most recent date Google has reported any data for this site. */
  gsc_latest_date: string | null;
}

/** One day of the site-level GSC rollup (`web.site_gsc_daily`). */
export type SiteGscDailyPoint =
  Database["web"]["Functions"]["site_gsc_daily"]["Returns"][number];

/** One top page by clicks over a window (`web.site_gsc_top_pages`). */
export type SiteGscTopPage =
  Database["web"]["Functions"]["site_gsc_top_pages"]["Returns"][number];

export interface PageListRow extends MarketingPage {
  /** Live sitemap memberships for this canonical page (0 = in no sitemap). */
  sitemap_count: number;
  /** Observed `<title>` from the latest accepted snapshot's head_tags. */
  observed_title: string | null;
  /** Observed word count from the latest accepted snapshot. */
  word_count: number | null;
  /** Whether Google reports this page in search results (any GSC stat row). */
  in_gsc: boolean;
  /** Stored SERP metadata verdict (`seo_metrics.overall_ok`); null = not computed. */
  serp_ok: boolean | null;
  /** Stored social-card verdict (`audit_metrics.social.ok`); null = not computed. */
  social_ok: boolean | null;
  /** Stored indexability verdict; null = not computed. */
  indexability_verdict: "indexable" | "check" | "blocked" | null;
  /** Count of passing stored health verdicts (SERP, social, indexability). */
  health_score: number | null;
  /** 28-day GSC click sum; null when Google has no data for the page. */
  gsc_clicks_28d: number | null;
  /** 28-day GSC impression sum; null when Google has no data for the page. */
  gsc_impressions_28d: number | null;
  /** Impression-weighted 28-day average position; null without data. */
  gsc_position_28d: number | null;
}

/** One page↔sitemap membership joined with its sitemap document identity. */
export interface PageSitemapMembershipRow extends PageSitemapMembership {
  sitemap: Pick<SiteSitemap, "id" | "url" | "kind">;
}

export interface SiteOverviewMetrics {
  siteScore: number | null;
  scoredPages: number;
  /** Canonical non-resource URLs backed by retained page evidence. */
  canonicalPages: number;
  /** Canonical non-resource URLs retained without current page evidence. */
  unconfirmedCandidates: number;
  /** Canonical non-HTML URLs retained as crawl/source evidence. */
  resourceUrls: number;
  openFindings: number;
  snapshots: number;
  latestCrawl: CrawlSession | null;
  /** Pages with a user-set target keyword (`web.page.target_keyword`). */
  targetKeywordPages: number;
  /** Pages Google Search Console reports impressions for (`v_page_list.in_gsc`). */
  pagesInGsc: number;
  /** Pages whose stored indexability verdict is `blocked`. */
  blockedPages: number;
  /** Pages whose stored SERP metadata verdict failed (`serp_ok = false`). */
  serpIssues: number;
  /** Live sitemap documents discovered for the site. */
  sitemaps: number;
  /** Total crawl sessions recorded for the site. */
  crawlSessions: number;
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
  searchPerformance: Pick<
    WebViews["v_page_list"]["Row"],
    "in_gsc" | "gsc_clicks_28d" | "gsc_impressions_28d" | "gsc_position_28d"
  >;
}

export interface CreateSiteInput {
  organizationId: string;
  name: string;
  rootUrl: string;
  domain: string;
  /** Explicit owning brand — always wins over name-match-or-create. */
  brandId?: string;
}

/**
 * Every user-editable site field. `root_url` / `domain` are deliberately
 * absent — changing them is a page-registry migration, not an edit.
 */
export interface UpdateSiteIdentityInput {
  siteId: string;
  expectedVersion: number;
  patch: Partial<
    Pick<
      MarketingSite,
      | "name"
      | "description"
      | "logo_url"
      | "favicon_url"
      | "og_image_url"
      | "status"
      | "visibility"
    >
  >;
}

/** Manually register a canonical page (provenance 'manual'). */
export interface CreateManualPageInput {
  siteId: string;
  organizationId: string;
  url: string;
}

/** Property kinds accepted by web.property's CHECK constraint. */
export const PROPERTY_KINDS = [
  "website",
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "youtube",
  "linkedin",
  "pinterest",
  "google_business_profile",
  "other",
] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export function isPropertyKind(value: string): value is PropertyKind {
  return PROPERTY_KINDS.some((kind) => kind === value);
}

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  google_business_profile: "Google Business Profile",
  other: "Other property",
};

export interface CreatePropertyInput {
  organizationId: string;
  brandId: string;
  kind: PropertyKind;
  url: string | null;
  handle: string | null;
  displayName: string | null;
  status: string;
}

export interface UpdatePropertyInput {
  propertyId: string;
  expectedVersion: number;
  patch: Partial<
    Pick<BrandProperty, "kind" | "url" | "handle" | "display_name" | "status">
  >;
}

/** Domain asset types accepted by web.brand_asset's `kind` CHECK constraint. Not Content-IR Shape kinds. */
export const BRAND_ASSET_KINDS = [
  "logo",
  "logo_dark",
  "favicon",
  "wordmark",
  "hero_image",
  "og_image",
  "twitter_image",
  "image",
  "video",
  "color",
  "font",
  "document",
  "portal",
  "other",
] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

export function isBrandAssetKind(value: string): value is BrandAssetKind {
  return BRAND_ASSET_KINDS.some((kind) => kind === value);
}

export const BRAND_ASSET_KIND_LABELS: Record<BrandAssetKind, string> = {
  logo: "Logo",
  logo_dark: "Logo (dark)",
  favicon: "Favicon",
  wordmark: "Wordmark",
  hero_image: "Hero image",
  og_image: "Open Graph image",
  twitter_image: "Twitter card image",
  image: "Image",
  video: "Video",
  color: "Color",
  font: "Font",
  document: "Document",
  portal: "Brand portal",
  other: "Other asset",
};

export interface CreateBrandAssetInput {
  organizationId: string;
  brandId: string;
  kind: BrandAssetKind;
  sourceUrl: string | null;
  title: string | null;
  notes: string | null;
  isPrimary: boolean;
  /** Our own file (uploads, AI-generated). Either this or sourceUrl. */
  fileId?: string | null;
  /**
   * Provenance — defaults to "manual". "generated" = AI-generated here;
   * "research" = promoted from the research media pool; "discovered" =
   * promoted from crawl/discovery evidence; "uploaded" = user file upload;
   * "stock" = saved from a licensed-free stock provider (Unsplash).
   */
  source?:
    "discovered" | "uploaded" | "manual" | "generated" | "research" | "stock";
}

export interface UpdateBrandAssetInput {
  assetId: string;
  expectedVersion: number;
  patch: Partial<
    Pick<
      BrandAsset,
      | "kind"
      | "source_url"
      | "title"
      | "notes"
      | "is_primary"
      | "sort_order"
      | "data"
    >
  >;
}

/** Domain fact types accepted by web.business_fact's `kind` CHECK constraint. Not Content-IR Shape kinds. */
export const BUSINESS_FACT_KINDS = [
  "phone",
  "fax",
  "email",
  "address",
  "hours",
  "tagline",
  "legal_name",
  "title",
  "description",
  "site_name",
  "social_profile",
  "service_area",
  "registration",
  "other",
] as const;
export type BusinessFactKind = (typeof BUSINESS_FACT_KINDS)[number];

export function isBusinessFactKind(value: string): value is BusinessFactKind {
  return BUSINESS_FACT_KINDS.some((kind) => kind === value);
}

export const BUSINESS_FACT_KIND_LABELS: Record<BusinessFactKind, string> = {
  phone: "Phone",
  fax: "Fax",
  email: "Email",
  address: "Address",
  hours: "Hours",
  tagline: "Tagline",
  legal_name: "Legal name",
  title: "Homepage title",
  description: "Homepage description",
  site_name: "Site name",
  social_profile: "Social profile",
  service_area: "Service area",
  registration: "Registration",
  other: "Other fact",
};

export interface CreateBusinessFactInput {
  organizationId: string;
  brandId: string;
  kind: BusinessFactKind;
  label: string | null;
  /** Stored as `{ text }` (or `{ url }` when the value is a URL). */
  value: string;
}

export interface UpdateBusinessFactInput {
  factId: string;
  expectedVersion: number;
  kind: BusinessFactKind;
  label: string | null;
  value: string;
}

export type DiscoveredItemStatus = "pending" | "confirmed" | "dismissed";

/** Confirm a discovered item as a brand asset. */
export interface ConfirmAssetInput {
  item: DiscoveredItem;
  assetKind: BrandAsset["kind"];
  title: string | null;
}

/** Confirm a social discovery as a first-class brand property. */
export interface ConfirmPropertyInput {
  item: DiscoveredItem;
  propertyKind: PropertyKind;
  displayName: string | null;
}

/** Confirm a discovered item as a business fact. */
export interface ConfirmFactInput {
  item: DiscoveredItem;
  factKind: BusinessFact["kind"];
  label: string | null;
}

/**
 * A page a generated title/description can be applied to. Carries `version`
 * because `updatePageIntent` is optimistically locked on it.
 */
export interface MetaApplyTarget {
  id: string;
  site_id: string;
  url: string;
  version: number;
  target_keyword: string | null;
  meta_title_desired: string | null;
  meta_description_desired: string | null;
}

export interface UpdatePageIntentInput {
  siteId: string;
  pageId: string;
  expectedVersion: number;
  targetKeyword: string | null;
  desiredMetaTitle: string | null;
  desiredMetaDescription: string | null;
}

// ─── Desired values (web.page.desired_values jsonb) ─────────────────────────
// The per-area desired-state mirror. Each card owns ONE key and saves through
// the single read-merge-write path (updatePageDesiredValues) so two cards can
// never clobber each other's areas. Add a key here + a card section — no
// migration needed.

export interface DesiredHeadingEntry {
  level: number;
  text: string;
}

export type DesiredImagePlanStatus = "planned" | "generated" | "placed";

export interface DesiredImagePlanEntry {
  id: string;
  description: string;
  alt: string;
  placement: string;
  status: DesiredImagePlanStatus;
  file_id: string | null;
  /** Style preset (or custom style text) fed to the image pipeline. */
  style?: string;
}

/**
 * One planned internal link. For a page's `inbound_links` plan, `url` is the
 * page that SHOULD link here; for `outbound_links`, `url` is the page this
 * page SHOULD link to. `anchor_text` is the preferred exact anchor — empty
 * means any accepted anchor (per the partner page's policy) satisfies the
 * plan. These are plans, not canonical entity relationships — jsonb is the
 * deliberate home (ruled 2026-07-29).
 */
export interface PlannedLinkEntry {
  /** Stable local id so list edits do not reorder React state. */
  id: string;
  url: string;
  anchor_text?: string;
}

export interface PageDesiredValues {
  /** ONE key per card — a card's slice save can never touch a sibling's. */
  social_card?: { og_title?: string; og_description?: string };
  indexability?: { canonical_url?: string; meta_robots?: string };
  headings?: { outline?: DesiredHeadingEntry[]; notes?: string };
  /**
   * Exact anchor phrases that are acceptable when another internal page links
   * to this page. Matching is case-insensitive with collapsed whitespace.
   */
  accepted_anchor_texts?: string[];
  /** Pages that SHOULD link to this page (source URL + preferred anchor). */
  inbound_links?: PlannedLinkEntry[];
  /** Links this page SHOULD carry (target URL + planned anchor). */
  outbound_links?: PlannedLinkEntry[];
  structured_data_notes?: string;
  /** Freeform plan notes for areas without a structured plan yet — each key
   *  is one card's slice (PagePlanNoteCard), same clobber-safe merge path. */
  identity_notes?: string;
  strategy_notes?: string;
  performance_goals?: string;
  backlink_plan?: string;
  image_plan?: DesiredImagePlanEntry[];
  /** Desired alt text for EXISTING crawled images, keyed by the image `src`
   *  from the snapshot inventory (`web.snapshot.images.items[].src`). */
  image_alts?: Record<string, string>;
  additional_content_notes?: string;
}

export type PageDesiredValuesKey = keyof PageDesiredValues;

/** Loose reader over the jsonb column — unknown keys survive round-trips. */
export function readPageDesiredValues(page: MarketingPage): PageDesiredValues {
  const raw = page.desired_values;
  return isJsonRecord(raw) ? (raw as PageDesiredValues) : {};
}

export interface UpdatePageDesiredValuesInput {
  siteId: string;
  pageId: string;
  /** Only the caller's own keys — merged over the fresh row server-side value. */
  patch: Partial<PageDesiredValues>;
}

// ─── Authored draft content (web.page_content, 1:1 with web.page) ───────────

export type PageContent = WebTables["page_content"]["Row"];

export interface SavePageContentInput {
  siteId: string;
  pageId: string;
  content: string;
  /** Version of the row being replaced; null when creating the first row. */
  expectedVersion: number | null;
}

export interface MarketingTableStateOptions {
  defaultSort: NonNullable<MatrxDataTableQueryState["sort"]>;
  defaultPageSize?: number;
}

export function isJsonRecord(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
