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
 * computed from the shared char-width table (`features/marketing/seo/serp/metrics.ts`,
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
  SurfaceWriteTarget,
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
    key: "authoring",
    label: "Authoring",
    sortOrder: 250,
    description:
      "User-authored desired state beyond metadata: draft content, per-area desired values, the keyword batch, and the image plan.",
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
    description: "Search Console, PageSpeed, and GA4 evidence for this page.",
  },
  {
    key: "attachments",
    label: "Attachments",
    sortOrder: 800,
    description:
      "Work and resources associated with this page: tasks and attached items.",
  },
  {
    key: "publication",
    label: "Publication",
    sortOrder: 850,
    description:
      "Where the authored plan ships: the Plan → CMS bridge for this page's route.",
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
    name: "target_keyword_data",
    label: "Target keyword data",
    description:
      "The condensed keyword dossier for the target keyword (buildKeywordBrief over seo.keyword + keyword_market): search volume, CPC, competition, trend, and intent classification. Empty when no target keyword is set or the phrase is not in the keyword library yet.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 525,
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

  // ── Authoring — desired state beyond metadata ─────────────────────────
  {
    name: "desired_values",
    label: "Desired values",
    description:
      "The per-area desired-state mirror (`web.page.desired_values`): social_card, indexability (canonical/robots), headings (outline plan), image_plan, the link plan (accepted_anchor_texts + planned inbound_links/outbound_links), and the per-area plan notes (identity_notes, structured_data_notes, strategy_notes, performance_goals, additional_content_notes, backlink_plan). Empty object when the user has expressed no desired state yet. Agents proposing changes to these areas write candidates for the matching key.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 300,
    group: "authoring",
  },
  {
    name: "draft_content",
    label: "Draft content",
    description:
      "The user-authored draft content for this page (`web.page_content.content`, markdown) — the editorial target body, distinct from the observed captured content. Empty when no draft has been written.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 310,
    group: "authoring",
  },
  {
    name: "keyword_batch",
    label: "Keyword batch",
    description:
      "The batch of keyword-library keywords attached to this page via association edges (role primary|supporting): one entry per keyword with phrase, role, search volume, and competition. The primary target_keyword rides separately in page intent. Empty array when nothing is attached.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 320,
    group: "authoring",
  },
  {
    name: "image_plan",
    label: "Image plan",
    description:
      "The planned images for this page (from desired_values.image_plan): per entry a description, alt text, placement, style preset (or custom style text) fed to the image pipeline, status (planned|generated|placed), and the generated image's file_id when produced. Empty array when no images are planned.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 330,
    group: "authoring",
  },

  {
    name: "link_plan",
    label: "Link plan",
    description:
      "The authored internal-link plan with live compliance scores: accepted_anchor_texts plus the planned inbound and outbound links, each entry scored against the observed crawl edges (linked / wrong_anchor / missing) with per-direction summaries. Empty when the user has authored no link plan for this page.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 340,
    group: "authoring",
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
    name: "structured_data",
    label: "Structured data",
    description:
      "Complete structured-data evidence from the latest snapshot: every parsed and original JSON-LD script, normalized entity blocks, schema types, microdata, RDFa, microformats, and parse errors. Empty when uncrawled or the page declares none.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 645,
    group: "observed_seo",
  },
  {
    name: "page_identity",
    label: "Page identity",
    description:
      "Observed page-identifying signals from the latest snapshot: featured image and its source, CMS/generator, WordPress or Shopify identifiers, template/platform evidence, application/site name, author, dates, schema types, locale, and related API/shortlink URLs.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 642,
    group: "observed_seo",
  },
  {
    name: "resources",
    label: "Page resources",
    description:
      "Complete DOM- and structured-metadata-declared resource inventory from the latest snapshot: images and responsive variants, video/audio, embeds, scripts, stylesheets, fonts, icons, manifests, tracks, and linked documents. Includes grouped counts and truncation evidence.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 647,
    group: "observed_seo",
  },
  {
    name: "perf",
    label: "Crawl performance",
    description:
      "Crawl-time performance evidence from the latest snapshot (response time, payload bytes). Empty when uncrawled. Distinct from PageSpeed Insights lab data.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 650,
    group: "observed_seo",
  },
  {
    name: "images",
    label: "Images",
    description:
      "Observed image evidence from the latest snapshot: total/missing-alt counts plus the per-image inventory (src/srcset, alt, dimensions, loading/decoding/fetch priority, title, featured-image marker). Empty when uncrawled; older snapshots may contain counts only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 655,
    group: "observed_seo",
  },
  {
    name: "media_inventory",
    label: "Media inventory",
    description:
      "The categorized media picture of the latest snapshot, deduped by src: totals, missing-alt count, size-tier/aspect bucket counts (landscape/square/portrait/graphics/icons), and a bounded asset list (src, alt, tier, aspect, size, occurrences; truncated flag when capped). Derived from the same categorization core the Page Media card renders from. Empty when uncrawled or the snapshot carries only image counts.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 657,
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
    name: "findings",
    label: "Findings",
    description:
      "The open, non-suppressed analysis findings against this page as listed on the workspace (bounded list): per finding its check, severity, message, and status. Empty array when nothing is open. Complements the open_findings count.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 605,
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
    name: "gsc_queries",
    label: "GSC top queries",
    description:
      "Per-query Search Console breakdown for this page over the default 28-day window (bounded list, up to 50 rows, strongest first): per query its clicks, impressions, and average position. The page's Search Console pane lets the user pick a wider range (90d/12m/all) interactively; this value always reflects the 28-day default. Empty array when GSC is not connected or reports nothing for the window.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2200,
    sortOrder: 472,
    group: "performance",
  },
  {
    name: "target_performance",
    label: "Target keyword performance",
    description:
      "How this page ACTUALLY performs for its target keyword, resolved once the target-performance pane has loaded: SERP rank observations (organic + AI-answer targets, each with the exact ranking/cited URL — reveals cannibalization when it's a different page of the site), Search Console clicks/impressions/position for the query on this page, the site-wide top page for the query, and the latest AI-answer citation evidence. Empty/undefined when no target keyword is set or the pane has not resolved yet in this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 473,
    group: "performance",
  },
  {
    name: "inbound_links",
    label: "Inbound internal links",
    description:
      "Internal pages linking TO this page (bounded list from web.link_edge): per link the source URL and anchor text. Empty array when the crawl found none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 474,
    group: "performance",
  },
  {
    name: "outbound_links",
    label: "Outbound internal links",
    description:
      "Internal pages this page links OUT to (bounded list from web.link_edge): per link the target URL and anchor text. Empty array when the crawl found none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 476,
    group: "performance",
  },
  {
    name: "backlinks",
    label: "Backlinks",
    description:
      "External backlink evidence for this page as loaded on the workspace: the latest snapshot totals and top referring rows. Empty when no backlink collection has run.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 478,
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

  // ── Attachments — associated work + resources ─────────────────────────
  {
    name: "page_tasks",
    label: "Page tasks",
    description:
      "Tasks associated with this page (via web_page association edges): per task its title, status, priority, and due date. Empty array when no tasks are linked.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 810,
    group: "attachments",
  },
  {
    name: "attached_items",
    label: "Attached items",
    description:
      "Summary of everything associated with this page (notes, files, conversations, working documents…): counts per entity type from the association edges. Empty when nothing is attached.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 820,
    group: "attachments",
  },

  // ── Publication — the Plan → CMS bridge ───────────────────────────────
  {
    name: "cms_push",
    label: "CMS push bridge",
    description:
      "Where this page's route lands on the linked CMS site: link standing (linked / matched_by / unlinked_reason), the resolved push target (existing page id + route, create, or blocked with reason), the target's published/pending-draft state, and the linked plan_node_id. Empty when the Push to CMS card has not resolved yet in this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 860,
    group: "publication",
  },
];

/**
 * The WRITE half — what an agent result (or a rendered kind component) may
 * change on this page. This is the proving surface for the 360 loop: the
 * "LSI Variations & Metadata" agent's kinds (`meta_tag_options`,
 * `keyword_relationship_research`, `keyword_search_metrics`) render with
 * apply buttons that land HERE, and nowhere else.
 *
 * Per-target defaults follow the surface's own opinion (a binding or shortcut
 * may override per target via `write_policies`): everything here PERSISTS
 * through the page's canonical services, so the surface defaults every entity
 * write to `ask` — an agent proposing your metadata is welcome, an agent
 * silently rewriting it is not. A user's click on an option card is consent
 * and never consults the policy.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "page_meta_tags",
    label: "Desired meta tags",
    description:
      "Set the page's DESIRED meta title and/or description (the editorial intent — never the observed crawl evidence). Value: { meta_title?: string, meta_description?: string }; omitted fields keep their current value. Persists immediately through updatePageIntent with the version guard; desired SEO metrics are recomputed on save.",
    valueType: "object",
    updatesValue: "page_intent",
    mode: "entity",
    applyPolicy: "ask",
    group: "page_intent",
    sortOrder: 100,
  },
  {
    name: "page_target_keyword",
    label: "Target keyword",
    description:
      "Set the page's primary target keyword. Value: { keyword: string }. Persists immediately through updatePageIntent (meta intent fields are preserved).",
    valueType: "object",
    updatesValue: "target_keyword",
    mode: "entity",
    applyPolicy: "ask",
    group: "page_intent",
    sortOrder: 110,
  },
  {
    name: "page_draft_content",
    label: "Draft content",
    description:
      "Propose the page's draft BODY (markdown). Value: { markdown: string, mode?: 'replace' | 'append' } — 'replace' (default) swaps the whole staged draft, 'append' adds after the current draft. STAGED into the Draft content editor's unsaved state for the user to review — nothing persists until the user clicks Save draft.",
    valueType: "object",
    updatesValue: "draft_content",
    mode: "draft",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 115,
  },
  {
    name: "page_supporting_keywords",
    label: "Supporting keywords",
    description:
      "Attach one or more phrases to this page as supporting keywords. Value: { keywords: string[] }. Each phrase is upserted into the keyword library and associated through the canonical chokepoint (addPageSupportingKeywords); duplicates are deduplicated, already-attached phrases are a no-op.",
    valueType: "object",
    updatesValue: "keyword_batch",
    mode: "entity",
    applyPolicy: "ask",
    group: "analysis",
    sortOrder: 120,
  },
  {
    name: "page_remove_keywords",
    label: "Remove supporting keywords",
    description:
      "Detach supporting keywords from this page. Value: { keywords: string[] } — phrases matched case-insensitively against the attached keyword_batch (supporting role only; the primary target keyword is changed via page_target_keyword, never removed here). Removes the association edges through the canonical chokepoint (removePageKeyword); the library rows themselves are untouched. A phrase that is not attached as supporting is an error.",
    valueType: "object",
    updatesValue: "keyword_batch",
    mode: "entity",
    applyPolicy: "ask",
    group: "analysis",
    sortOrder: 125,
  },
  {
    name: "page_social_card",
    label: "Desired social card",
    description:
      "Set the page's DESIRED Open Graph share-card copy (`desired_values.social_card`). Value: { og_title?: string, og_description?: string } — at least one; omitted fields keep their current desired value. Persists immediately through updatePageDesiredValues (clobber-safe merge — sibling plan areas are never touched). Read the observed social_card value for what the live site currently serves.",
    valueType: "object",
    updatesValue: "desired_values",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 130,
  },
  {
    name: "page_indexability_plan",
    label: "Desired indexability",
    description:
      "Set the page's DESIRED canonical URL and/or meta robots directive (`desired_values.indexability`). Value: { canonical_url?: string, meta_robots?: string } (e.g. meta_robots 'index, follow' or 'noindex') — at least one; omitted fields keep their current desired value. Persists immediately through updatePageDesiredValues. Read the observed indexability value for what the live site currently serves.",
    valueType: "object",
    updatesValue: "desired_values",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 135,
  },
  {
    name: "page_headings_plan",
    label: "Desired heading outline",
    description:
      "Set the page's DESIRED heading structure (`desired_values.headings`). Value: { outline: [{ level: 1-6, text: string }, …], notes?: string } — outline REPLACES the full planned outline (include every heading you want kept; read desired_values.headings for the current plan and headings_outline for the observed structure); notes replaces the plan notes when provided, otherwise keeps them. Persists immediately through updatePageDesiredValues.",
    valueType: "object",
    updatesValue: "desired_values",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 140,
  },
  {
    name: "page_link_plan",
    label: "Link plan",
    description:
      "Set the page's authored internal-link plan (`desired_values` link keys). Value: { accepted_anchor_texts?: string[], inbound_links?: [{ url: string, anchor_text?: string }], outbound_links?: [{ url: string, anchor_text?: string }] } — at least one key; each PROVIDED key REPLACES that whole list (read the link_plan value first and include entries to keep), omitted keys keep their current value. inbound_links are pages that SHOULD link here; outbound_links are pages this page SHOULD link to. Persists immediately through updatePageDesiredValues; compliance is re-scored against the observed crawl edges.",
    valueType: "object",
    updatesValue: "link_plan",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 145,
  },
  {
    name: "page_plan_notes",
    label: "Plan notes",
    description:
      "Set the page's freeform per-area plan notes (`desired_values` note keys). Value: an object with at least one of { identity_notes?, structured_data_notes?, strategy_notes?, performance_goals?, backlink_plan?, additional_content_notes? } — each a non-empty string that REPLACES that note; omitted keys keep their current value. Persists immediately through updatePageDesiredValues (clobber-safe merge).",
    valueType: "object",
    updatesValue: "desired_values",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 150,
  },
  {
    name: "page_image_plan",
    label: "Image plan",
    description:
      "Propose planned images for this page (`desired_values.image_plan`). Value: { images: [{ description: string, alt?: string, placement?: string, style?: string }], mode?: 'replace' | 'append' } — 'append' (default) adds after the current plan entries, 'replace' swaps the whole plan. Each entry is created with status 'planned' and no file yet; the user generates the actual image from the plan card. Persists immediately through updatePageDesiredValues. Read the image_plan value for the current entries.",
    valueType: "object",
    updatesValue: "image_plan",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 155,
  },
  {
    name: "page_image_alts",
    label: "Desired image alt text",
    description:
      "Set DESIRED alt text for EXISTING crawled images (`desired_values.image_alts`). Value: { alts: { [src: string]: string } } — keys are exact image src values from the observed images inventory (images.items[].src), values are the proposed alt text. Provided entries are merged over the current desired alts; other srcs keep their value. Persists immediately through updatePageDesiredValues. Never invents images — only plans alt text for what the crawl observed.",
    valueType: "object",
    updatesValue: "desired_values",
    mode: "entity",
    applyPolicy: "ask",
    group: "authoring",
    sortOrder: 160,
  },
];

/**
 * UI-state keys this surface publishes (`publishSurfaceUiState`, read by
 * rendered blocks via `useCurrentSurfaceUiState`) — the read twin of the
 * write targets above. Code-only, like `writeTargets`; publisher:
 * `MarketingPageWriteTargets.tsx`.
 *
 * - `page_keywords`: `{ target: string | null, supporting: string[] }` — the
 *   page's current primary target keyword plus the attached supporting
 *   keyword phrases (the `keyword_batch` association edges, primary
 *   excluded). Lets a keyword kind-component mark already-attached phrases
 *   without knowing which page it landed on. Cleared on unmount.
 */

export const marketingPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-page",
  readiness: "verified",
  label: "Marketing Page Workspace",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
The inherited brand_context and site_context values give you the client and website this page belongs to — read them for framing before working on the page itself.
You are on the Marketing page workspace: one canonical URL of a managed website, with the evidence of what it currently serves and the user's editorial intent for what it should become.
Two kinds of values live here and must never be confused: OBSERVED values (observed_title, observed_description, observed_seo_metrics) are immutable crawl evidence of the live site; DESIRED values (desired_title, desired_description, desired_seo_metrics) are the user's editorial targets stored on the page. When asked to improve metadata, you propose DESIRED values — you never alter or invent observed evidence.
Beyond metadata, the surface carries complete crawl evidence: page_identity (featured image, CMS/platform identifiers, author/dates), structured_data (all raw and normalized JSON-LD/microdata/RDFa/microformats), resources (the full declared asset inventory), images, and visual captures. Large raw evidence values remain explicitly bindable but are not auto-added to every agent context. It also carries analysis evidence (Page Analyzer keyword picture, page score, open findings + findings rows), performance evidence (Search Console metrics + the default-28d per-query breakdown in gsc_queries, target_performance — SERP rank + AI-answer citation evidence specifically for the target keyword, PageSpeed Insights, GA4, internal links, backlinks), and the user's AUTHORING layer: draft_content (the markdown body the page SHOULD have), desired_values (per-area desired state: social card, canonical/robots, heading-structure plan, image plan — each planned image also carries an optional style preset), the keyword_batch (library keywords attached to this page alongside the primary target_keyword), link_plan (the authored internal-link plan scored live against the observed edges), and page_tasks (work linked to this page). The cms_push value tells you where the authored plan ships: which CMS page this route resolves to and whether a push would update, create, or is blocked.
SEO metrics are deterministic (shared pixel-width table between browser and scraper): trust the provided pixel_width / ok flags instead of estimating lengths, and validate any candidate you generate with the seo tool before presenting it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
    {
      name: "image_producer",
      label: "Image producer",
      description:
        "Generates images for the page's image plan from a per-image spec (description, alt intent, placement). Must be bound to an agent whose model outputs images; the plan card's Generate button runs it headlessly and stores the produced file id on the plan entry.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 140,
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
  gsc_synced_at?: string;
  // alwaysAvailable: false → optional
  page_status?: string;
  page_provenance?: string;
  first_seen?: string;
  last_seen?: string;
  target_keyword?: string;
  desired_title?: string;
  desired_description?: string;
  desired_seo_metrics?: Record<string, unknown>;
  target_keyword_data?: Record<string, unknown>;
  page_intent?: Record<string, unknown>;
  observed_title?: string;
  observed_description?: string;
  observed_seo_metrics?: Record<string, unknown>;
  observed_audit_metrics?: Record<string, unknown>;
  headings_outline?: Array<{ level: number; text: string }>;
  http_status?: number;
  indexability?: Record<string, unknown>;
  social_card?: Record<string, unknown>;
  structured_data?: Record<string, unknown>;
  page_identity?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  perf?: Record<string, unknown>;
  images?: Record<string, unknown>;
  url_quality_issues?: Array<Record<string, unknown>>;
  desired_values?: Record<string, unknown>;
  link_plan?: Record<string, unknown>;
  media_inventory?: Record<string, unknown>;
  cms_push?: Record<string, unknown>;
  draft_content?: string;
  keyword_batch?: Array<Record<string, unknown>>;
  image_plan?: Array<Record<string, unknown>>;
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
  findings?: Array<Record<string, unknown>>;
  page_analyzer?: Record<string, unknown>;
  page_score?: number;
  failed_checks?: number;
  gsc_metrics_28d?: Record<string, unknown>;
  gsc_queries?: Array<Record<string, unknown>>;
  target_performance?: Record<string, unknown>;
  inbound_links?: Array<Record<string, unknown>>;
  outbound_links?: Array<Record<string, unknown>>;
  backlinks?: Record<string, unknown>;
  pagespeed?: Record<string, unknown>;
  ga4_metrics?: Record<string, unknown>;
  sitemap_memberships?: Array<Record<string, unknown>>;
  page_tasks?: Array<Record<string, unknown>>;
  attached_items?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
