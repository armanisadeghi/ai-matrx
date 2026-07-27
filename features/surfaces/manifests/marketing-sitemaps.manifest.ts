/**
 * Surface manifest — Marketing sitemaps workspace (`matrx-user/marketing-sitemaps`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/sitemaps` and its
 * `/sitemaps/[sitemapId]` detail route — the sitemap-document workspace of
 * one managed website (`features/marketing`, `SitemapsWorkspace` +
 * `SitemapDetail`): every discovered sitemap document (`web.sitemap` — index
 * or urlset, URL/child counts, HTTP status, fetch errors, freshness) plus the
 * coverage rollup of how listed URLs flow into the canonical page registry.
 * Sitemap documents and their page memberships are system-written by the
 * sync command; users only activate/deactivate or delete them. Inherits the
 * brand + site context blocks from `matrx-user/marketing-site`.
 *
 * Runtime emitter: `SitemapsWorkspace.tsx` (list) and `SitemapDetail.tsx`
 * (detail) each mount the nested `<SurfaceRuntimeProvider>` and spread
 * `useMarketingSiteSurfaceBase().getBaseValues()` into
 * `createMarketingSitemapsScope(...)` at trigger time. The list emits the
 * document roster + coverage rollup; the detail route additionally emits the
 * open document and its listed-page rows.
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
    key: "sitemap_documents",
    label: "Sitemap documents",
    sortOrder: 100,
    description:
      "Every sitemap document discovered for this site and how they break down.",
  },
  {
    key: "sitemap_coverage",
    label: "Sitemap coverage",
    sortOrder: 200,
    description:
      "How the URLs those documents list flow into the canonical page registry.",
  },
  {
    key: "open_sitemap",
    label: "Open sitemap",
    sortOrder: 300,
    description:
      "The single document open on the detail route and the listed pages the user is paging through. Empty on the sitemaps list.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Sitemap documents ─────────────────────────────────────────────────
  {
    group: "sitemap_documents",
    name: "sitemaps_summary",
    label: "Sitemap documents summary",
    description:
      "One entry per discovered sitemap document: URL, kind (sitemapindex vs urlset), HTTP status, URL/child counts, active flag, fetch error, and last-fetched freshness. Empty when no sync has run yet or during initial load. On the detail route this holds only the open document.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 400,
    autoContext: false,
  },
  {
    group: "sitemap_documents",
    name: "sitemap_counts",
    label: "Sitemap document counts",
    description:
      "How the roster breaks down: { total, indexes (sitemapindex documents), url_sets }. Zeroes when no sync has run; empty during initial load. Not emitted on the detail route, which shows one document.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 410,
  },

  // ── Sitemap coverage ──────────────────────────────────────────────────
  {
    group: "sitemap_coverage",
    name: "sitemap_coverage",
    label: "Sitemap coverage rollup",
    description:
      "The coverage rollup shown in the metric row as one object: { sitemaps, pages_in_sitemaps, never_crawled, last_synced_at }. Mirrors the individual coverage values as one group value. Empty during initial load or on the detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 140,
    sortOrder: 500,
  },
  {
    group: "sitemap_coverage",
    name: "sitemap_pages_total",
    label: "Pages in sitemaps",
    description:
      "Count of canonical registry pages that appear in at least one sitemap (the coverage rollup). Zero when no sync has run; empty during initial load or on the detail route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 510,
  },
  {
    group: "sitemap_coverage",
    name: "sitemap_never_crawled",
    label: "Listed but never crawled",
    description:
      "Count of sitemap-listed canonical pages no crawl has ever captured — advertised URLs with no content evidence. Zero when every listed URL has a snapshot; empty during initial load or on the detail route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 520,
  },
  {
    group: "sitemap_coverage",
    name: "sitemaps_last_synced_at",
    label: "Sitemaps last synced",
    description:
      "ISO timestamp of the most recent sitemap sync (robots.txt + index discovery) for this site — how stale the whole roster is. Empty when sitemaps have never been synced, or on the detail route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 530,
  },

  // ── Open sitemap ──────────────────────────────────────────────────────
  {
    group: "open_sitemap",
    name: "sitemap_id",
    label: "Open sitemap ID",
    description:
      "UUID of the `web.sitemap` document open on the detail route (`/sitemaps/[sitemapId]`). Empty on the sitemaps list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
  },
  {
    group: "open_sitemap",
    name: "open_sitemap",
    label: "Open sitemap document",
    description:
      "The single document open on the detail route: url, kind, http_status, url_count, child_count, is_active, fetch_error, and last_fetched_at. Empty on the sitemaps list — read sitemaps_summary there instead.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 600,
  },
  {
    group: "open_sitemap",
    name: "sitemap_pages",
    label: "Listed pages",
    description:
      "The listed-page membership rows currently loaded on the detail route (server-paged, respecting the crawled filter, search, and sort): per row the page path and URL, whether it has been crawled, its registry status, how many sitemaps list it, and its lastmod. Empty on the list route or when the filter matches nothing.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 610,
  },
  {
    group: "open_sitemap",
    name: "sitemap_pages_table_state",
    label: "Listed pages table state",
    description:
      "What the user currently sees in the detail route's listed-pages table: total matching rows, loaded row count, page number, search term, and the active listed filter (all | never_crawled). Empty on the sitemaps list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    sortOrder: 620,
  },
];

export const marketingSitemapsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-sitemaps",
  readiness: "verified",
  label: "Marketing Sitemaps",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/sitemaps",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the sitemaps workspace of a managed website: every sitemap document the site publishes (indexes and URL sets, with HTTP status, URL counts, fetch errors, and freshness) and the rollup of how those listed URLs flow into the canonical page registry. The user comes here to check sitemap health, run a sync, and spot listed-but-never-crawled pages.
Read brand_context and site_context first for the client and site framing. sitemaps_summary is stored evidence written by the sync command — report statuses and counts as given, never invent a document or a count; sitemap_id is set only when a single URL-set document is open on the detail route.
Sitemap documents and page-membership evidence are system-written: users only activate/deactivate or delete a document, and a deleted document reappears on the next sync that re-discovers it. Your job is to interpret coverage — a listed URL missing from crawls, a 4xx sitemap, a stale fetch — and recommend the next action, not to fabricate registry state.
Two routes share this surface. On the list, read sitemaps_summary, sitemap_counts, and the coverage rollup (sitemap_pages_total, sitemap_never_crawled, sitemaps_last_synced_at). On the detail route, sitemap_id and open_sitemap identify the one document and sitemap_pages carries the listed URLs the user is paging through — the list-only values are absent there, which is not an error.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "sitemap_auditor",
      label: "Sitemap auditor",
      description:
        "Audits the sitemap documents themselves — fetch errors, HTTP status, staleness, inactive documents, index/urlset structure.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "indexation_strategist",
      label: "Indexation strategist",
      description:
        "Interprets how sitemap coverage maps onto the canonical registry (listed vs crawled vs indexed) and recommends indexation fixes.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited `brand_id` + `site_id` from the marketing-brand → marketing-site
 * chain.
 */
export function createMarketingSitemapsScope(values: {
  // alwaysAvailable: true → required (inherited)
  brand_id: string;
  site_id: string;
  // Inherited optionals (marketing-brand + marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // alwaysAvailable: false → optional
  sitemap_id?: string;
  sitemaps_summary?: Array<Record<string, unknown>>;
  sitemap_counts?: Record<string, unknown>;
  sitemap_coverage?: Record<string, unknown>;
  sitemap_pages_total?: number;
  sitemap_never_crawled?: number;
  sitemaps_last_synced_at?: string;
  open_sitemap?: Record<string, unknown>;
  sitemap_pages?: Array<Record<string, unknown>>;
  sitemap_pages_table_state?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
