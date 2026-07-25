/**
 * Surface manifest — Marketing page workspace (`matrx-user/marketing-page`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]` — the
 * canonical-page cockpit of the Marketing system (`features/marketing`,
 * `PageWorkspace`). One canonical URL (`web.page`) + its latest observed
 * capture (`web.snapshot`): SERP preview, user-owned intent (target keyword +
 * desired metadata), indexability, headings, content stats, captures.
 *
 * The load-bearing distinction agents must understand here:
 *   - OBSERVED values come from the latest accepted crawl snapshot — they are
 *     immutable evidence of what the live site currently serves.
 *   - DESIRED values are the user's editorial targets stored on the page row —
 *     what the metadata SHOULD become. Agents propose desired values; they
 *     never fabricate observed ones.
 *
 * SEO metrics (pixel widths, char counts, pass flags) are DETERMINISTIC —
 * computed from the shared char-width table (`features/seo/serp/metrics.ts`,
 * mirrored by the scraper's `matrx_scraper.meta_metrics`). The scraper stamps
 * `web.snapshot.seo_metrics` on every capture; the client stamps
 * `web.page.seo_metrics_desired` on every intent save. Agents should trust
 * these numbers rather than re-deriving lengths, and can recompute
 * server-side via the `seo` tool when generating candidates.
 *
 * Runtime scope assembly lives in
 * `features/marketing/lib/marketing-page-scope.ts` — PageWorkspace hands its
 * loaded workspace data to `buildMarketingPageScope` at launch time.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "page_identity",
    label: "Page identity",
    sortOrder: 100,
    description: "Which canonical page this is and its lifecycle standing.",
  },
  {
    key: "page_intent",
    label: "Page intent",
    sortOrder: 200,
    description:
      "The user's editorial targets — what this page's metadata should become.",
  },
  {
    key: "observed_seo",
    label: "Observed SEO",
    sortOrder: 300,
    description:
      "Immutable crawl evidence of what the live site currently serves.",
  },
  {
    key: "captured_content",
    label: "Captured content",
    sortOrder: 400,
    description: "The page body captured by the latest accepted snapshot.",
  },
  {
    key: "captures",
    label: "Captures",
    sortOrder: 500,
    description: "Visual screenshot records of this page (desktop + mobile).",
  },
  {
    key: "analysis",
    label: "Analysis",
    sortOrder: 600,
    description: "Derived findings and the AI keyword picture for this page.",
  },
  {
    key: "performance",
    label: "Performance & analytics",
    sortOrder: 700,
    description:
      "Search Console, PageSpeed, and GA4 evidence for this page.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Page identity ─────────────────────────────────────────────────────
  {
    name: "page_id",
    label: "Canonical page ID",
    description:
      "UUID of the `web.page` row the user has open. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "page_identity",
  },
  // site_id / brand_id are inherited from matrx-user/marketing-site /
  // matrx-user/marketing-brand (both alwaysAvailable — the route carries
  // them), so the scope helper still requires them.
  {
    name: "page_url",
    label: "Page URL",
    description:
      "Full canonical URL of the page (e.g. https://example.com/services/). Always present once the workspace has loaded — launches only happen from a loaded workspace.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 330,
    group: "page_identity",
  },
  {
    name: "page_path",
    label: "Page path",
    description:
      "The site-relative path of the canonical URL (e.g. /services/). Always present — the page row always carries it; the homepage is the empty path rendered as /.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    sortOrder: 332,
    group: "page_identity",
  },
  {
    name: "page_status",
    label: "Status",
    description:
      "Lifecycle status of the canonical page row (e.g. active). Reflects the page record, not the live HTTP response.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 334,
    group: "page_identity",
  },
  {
    name: "page_provenance",
    label: "Provenance",
    description:
      "How this canonical URL entered the system (e.g. sitemap, crawl, manual). Empty when the record predates provenance tracking.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 336,
    group: "page_identity",
  },
  {
    name: "first_seen",
    label: "First seen",
    description:
      "ISO timestamp of when this canonical URL was first discovered. Empty when the record predates discovery tracking.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 338,
    group: "page_identity",
  },
  {
    name: "last_seen",
    label: "Last seen",
    description:
      "ISO timestamp of the most recent time any collection observed this URL. Empty when never observed since tracking began.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 339,
    group: "page_identity",
  },

  // ── Page intent — the user's editorial targets ────────────────────────
  {
    name: "target_keyword",
    label: "Target keyword",
    description:
      "The user's primary search intent for this page (`web.page.target_keyword`). Empty when the user hasn't set one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 340,
    group: "page_intent",
  },
  {
    name: "desired_title",
    label: "Desired meta title",
    description:
      "The user's editorial TARGET title (`web.page.meta_title_desired`) — what the title should become, distinct from what the site serves. Empty when no target is set. Agents proposing titles write candidates for THIS field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 500,
    group: "page_intent",
  },
  {
    name: "desired_description",
    label: "Desired meta description",
    description:
      "The user's editorial TARGET description (`web.page.meta_description_desired`). Empty when no target is set. Agents proposing descriptions write candidates for THIS field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 510,
    group: "page_intent",
  },
  {
    name: "desired_seo_metrics",
    label: "Desired SEO metrics",
    description:
      "Deterministic metrics for the DESIRED title+description (same contract v1 shape as observed_seo_metrics). Stamped by the client on every intent save (`web.page.seo_metrics_desired`). Empty when no targets are set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 520,
    group: "page_intent",
  },
  {
    name: "page_intent",
    label: "Page intent",
    description:
      "The composite user-owned intent object: { target_keyword, desired_title, desired_description, desired_seo_metrics }. Mirrors the individual page-intent values as one group value (completeness law). Empty when the user has set none of them.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 530,
    group: "page_intent",
  },

  // ── Observed SEO — crawl evidence ─────────────────────────────────────
  {
    name: "observed_title",
    label: "Observed meta title",
    description:
      "The <title> the live site actually served in the latest accepted snapshot. Empty when no crawl has captured this page yet, or the page has no title tag. Evidence — never invented.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 400,
    group: "observed_seo",
  },
  {
    name: "observed_description",
    label: "Observed meta description",
    description:
      "The meta description the live site actually served in the latest accepted snapshot. Empty when uncrawled or absent on the page. Evidence — never invented.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 410,
    group: "observed_seo",
  },
  {
    name: "observed_seo_metrics",
    label: "Observed SEO metrics",
    description:
      "Deterministic metrics for the OBSERVED title+description (contract v1: pixel_width, character_count, desktop_ok, mobile_ok, seo_length_ok, ok, issues[] per field + overall_ok). Stamped by the scraper at capture time (`web.snapshot.seo_metrics`). Empty when uncrawled.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 420,
    group: "observed_seo",
  },
  {
    name: "observed_audit_metrics",
    label: "Observed audit metrics",
    description:
      "Deterministic page-audit for the latest snapshot (contract v1: social share card, heading structure, and indexability verdict — each with ok, facts, and issues[{severity,message}]). Stamped by the scraper at capture time (`web.snapshot.audit_metrics`). Empty when uncrawled.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 425,
    group: "observed_seo",
  },
  {
    name: "headings_outline",
    label: "Headings outline",
    description:
      "Ordered heading structure of the latest snapshot: one entry per heading with level (1-6) and text, exactly as the live page serves them. Empty when uncrawled or the page has no headings. Observed evidence — never invented.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 460,
    group: "observed_seo",
  },
  {
    name: "http_status",
    label: "Last HTTP status",
    description:
      "HTTP status the page last returned to the crawler (e.g. 200, 301, 404). Empty when uncrawled.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 610,
    group: "observed_seo",
  },
  {
    name: "indexability",
    label: "Indexability",
    description:
      "Observed indexing signals from the latest snapshot's head tags and audit: meta robots, canonical URL, redirect chain, final URL, and declared language. Empty when uncrawled.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 620,
    group: "observed_seo",
  },
  {
    name: "social_card",
    label: "Social share preview",
    description:
      "Observed Open Graph / Twitter share-card tags plus the deterministic evaluation issues for them. Empty when uncrawled.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 630,
    group: "observed_seo",
  },
  {
    name: "url_quality_issues",
    label: "URL quality issues",
    description:
      "Live deterministic URL-quality findings for the canonical URL itself (length, casing, parameters, …). Computed from the URL alone — needs no crawl. Empty array when the URL is clean.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 640,
    group: "observed_seo",
  },

  // ── Captured content — the page itself ────────────────────────────────
  {
    name: "page_content",
    label: "Page content (markdown)",
    description:
      "The FULL extracted markdown of the page's latest accepted snapshot — the actual body content the live site serves. Empty when the page has never been captured. This is the primary payload for content analysis, keyword work, and rewriting.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 450,
    group: "captured_content",
  },
  {
    name: "content",
    label: "Primary content",
    description:
      "Alias of page_content for generic bindings: the full extracted markdown of the latest snapshot. Empty when uncrawled.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 455,
    group: "captured_content",
  },
  {
    name: "word_count",
    label: "Word count",
    description:
      "Word count of the latest snapshot's main content. Zero/empty when uncrawled.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 440,
    group: "captured_content",
  },
  {
    name: "snapshot_captured_at",
    label: "Snapshot captured at",
    description:
      "ISO timestamp of the latest accepted snapshot — how fresh the observed evidence is. Empty when uncrawled.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 430,
    group: "captured_content",
  },
  {
    name: "content_stats",
    label: "Content stats",
    description:
      "Quantitative content signals from the latest snapshot: sentence count, Flesch reading ease, link totals (internal/external), and image count plus missing-alt count. Empty when uncrawled.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 470,
    group: "captured_content",
  },
  {
    name: "content_file_ids",
    label: "Content file IDs",
    description:
      "File ids of the stored capture artifacts: { body_file_id (raw HTML), markdown_file_id (extracted markdown) }. Empty when uncrawled; either id may be null when that artifact wasn't stored.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 110,
    sortOrder: 480,
    group: "captured_content",
  },

  // ── Captures — screenshots ────────────────────────────────────────────
  {
    name: "captures",
    label: "Captures",
    description:
      "Screenshot records for this page as loaded on the workspace, newest first: one entry per capture with kind, file_id, captured_at, width, height, and snapshot_id. Empty array when the page has never been captured visually.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 500,
    group: "captures",
  },
  {
    name: "has_desktop_capture",
    label: "Desktop captured",
    description:
      "True when at least one desktop-sized screenshot exists for this page. False (or absent while captures are still loading) otherwise.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 510,
    group: "captures",
  },
  {
    name: "has_mobile_capture",
    label: "Mobile captured",
    description:
      "True when at least one mobile-sized screenshot exists for this page. False (or absent while captures are still loading) otherwise.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 520,
    group: "captures",
  },

  // ── Analysis ──────────────────────────────────────────────────────────
  {
    name: "open_findings",
    label: "Open findings",
    description:
      "Number of open, non-suppressed analysis findings against this page. Zero when the analysis pipeline has found nothing (or hasn't run).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
    group: "analysis",
  },
  {
    name: "page_analyzer",
    label: "Page Analyzer",
    description:
      "The Page Analyzer agent's keyword picture for this page: inferred_primary_keyword, supported_keywords, discovered_keywords, content_role, funnel_position, declared_vs_actual, and gaps[]. Empty when the analyzer has not run in this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 610,
    group: "analysis",
  },
  {
    name: "page_score",
    label: "Page score",
    description:
      "Composite check-based score for this page from `v_page_score`. Empty when the page has never been scored.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 620,
    group: "analysis",
  },
  {
    name: "failed_checks",
    label: "Failed checks",
    description:
      "Number of failing checks contributing to the page score. Zero when all checks pass or the page has never been scored.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 630,
    group: "analysis",
  },

  // ── Performance & analytics ───────────────────────────────────────────
  {
    name: "gsc_metrics_28d",
    label: "Google Search Console (28d)",
    description:
      "Rolling 28-day Google Search Console evidence for this page: clicks, impressions, ctr, position. Empty when GSC is not connected or never synced.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 470,
    group: "performance",
  },
  {
    name: "pagespeed",
    label: "PageSpeed Insights",
    description:
      "Latest persisted PageSpeed Insights evidence per strategy (mobile/desktop): Lighthouse category scores, lab LCP/CLS/INP, the CrUX field category, and observed_at. Empty when no collection has run for this page.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 480,
    group: "performance",
  },
  {
    name: "ga4_metrics",
    label: "Google Analytics",
    description:
      "Stored GA4 landing-page totals for this page: sessions, users, engaged sessions, and engagement rate. Empty when GA4 is not connected or no rows are stored.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 490,
    group: "performance",
  },
  {
    name: "sitemap_memberships",
    label: "Sitemap memberships",
    description:
      "Which sitemap documents advertise this canonical URL: one entry per sitemap with its url, lastmod, and last_seen. Empty array when no sitemap advertises the URL.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 495,
    group: "performance",
  },
];

export const marketingPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-page",
  label: "Marketing Page Workspace",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
The inherited brand_context and site_context values give you the client and website this page belongs to — read them for framing before working on the page itself.
You are on the Marketing page workspace: one canonical URL of a managed website, with the evidence of what it currently serves and the user's editorial intent for what it should become.
Two kinds of values live here and must never be confused: OBSERVED values (observed_title, observed_description, observed_seo_metrics) are immutable crawl evidence of the live site; DESIRED values (desired_title, desired_description, desired_seo_metrics) are the user's editorial targets stored on the page. When asked to improve metadata, you propose DESIRED values — you never alter or invent observed evidence.
Beyond metadata, the surface also carries visual captures (screenshots), analysis evidence (Page Analyzer keyword picture, page score, open findings), and performance evidence (Search Console, PageSpeed Insights, GA4) when loaded.
SEO metrics are deterministic (shared pixel-width table between browser and scraper): trust the provided pixel_width / ok flags instead of estimating lengths, and validate any candidate you generate with the seo tool before presenting it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  // The AI layer for this surface is deliberately staged: these roles are the
  // declared slots the marketing agent fleet (metadata writers, SERP analysts,
  // content auditors, keyword strategists, …) will bind into. Declaring them
  // now means the binding UI and runtime are ready the day the agents are.
  agentRoles: [
    {
      name: "metadata_optimizer",
      label: "Metadata optimizer",
      description:
        "Proposes desired meta title/description candidates for this page, validated against the deterministic SERP limits.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "serp_analyst",
      label: "SERP analyst",
      description:
        "Explains how this page appears in search results and what to change, using observed metrics and GSC evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "content_auditor",
      label: "Content auditor",
      description:
        "Audits the captured page content (headings, word count, readability) against the target keyword.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
    {
      name: "keyword_strategist",
      label: "Keyword strategist",
      description:
        "Recommends or refines the target keyword for this page from its content and site context.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 130,
    },
  ],
};

/** One screenshot record as emitted in the `captures` surface value. */
export interface MarketingPageCaptureEntry {
  kind: string;
  file_id: string;
  captured_at: string | null;
  width: number | null;
  height: number | null;
  snapshot_id: string | null;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createMarketingPageScope(values: {
  // alwaysAvailable: true → required (site_id / brand_id are inherited but
  // still guaranteed — the route carries them)
  page_id: string;
  site_id: string;
  brand_id: string;
  page_url: string;
  page_path: string;
  // inherited optionals (marketing-brand / marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // alwaysAvailable: false → optional
  page_status?: string;
  page_provenance?: string;
  first_seen?: string;
  last_seen?: string;
  target_keyword?: string;
  desired_title?: string;
  desired_description?: string;
  desired_seo_metrics?: Record<string, unknown>;
  page_intent?: Record<string, unknown>;
  observed_title?: string;
  observed_description?: string;
  observed_seo_metrics?: Record<string, unknown>;
  observed_audit_metrics?: Record<string, unknown>;
  headings_outline?: Array<{ level: number; text: string }>;
  http_status?: number;
  indexability?: Record<string, unknown>;
  social_card?: Record<string, unknown>;
  url_quality_issues?: Array<Record<string, unknown>>;
  page_content?: string;
  content?: string;
  word_count?: number;
  snapshot_captured_at?: string;
  content_stats?: Record<string, unknown>;
  content_file_ids?: Record<string, unknown>;
  captures?: MarketingPageCaptureEntry[];
  has_desktop_capture?: boolean;
  has_mobile_capture?: boolean;
  open_findings?: number;
  page_analyzer?: Record<string, unknown>;
  page_score?: number;
  failed_checks?: number;
  gsc_metrics_28d?: Record<string, unknown>;
  pagespeed?: Record<string, unknown>;
  ga4_metrics?: Record<string, unknown>;
  sitemap_memberships?: Array<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
