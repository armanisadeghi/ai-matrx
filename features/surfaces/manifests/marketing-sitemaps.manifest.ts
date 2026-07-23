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
 * Runtime emitter: features/marketing/lib/scopes/sitemaps-scope.ts — being
 * built in parallel.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity (300-349) ────────────────────────────────────────────────
  {
    name: "sitemap_id",
    label: "Open sitemap ID",
    description:
      "UUID of the `web.sitemap` document open on the detail route (`/sitemaps/[sitemapId]`). Empty on the sitemaps list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
  },

  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "sitemaps_summary",
    label: "Sitemap documents summary",
    description:
      "One entry per discovered sitemap document: URL, kind (sitemapindex vs urlset), HTTP status, URL/child counts, active flag, fetch error, and last-fetched freshness. Empty when no sync has run yet or during initial load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 400,
    autoContext: false,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "sitemap_pages_total",
    label: "Pages in sitemaps",
    description:
      "Count of canonical registry pages that appear in at least one sitemap (the coverage rollup). Zero when no sync has run; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
  },
];

export const marketingSitemapsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-sitemaps",
  label: "Marketing Sitemaps",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/sitemaps",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the sitemaps workspace of a managed website: every sitemap document the site publishes (indexes and URL sets, with HTTP status, URL counts, fetch errors, and freshness) and the rollup of how those listed URLs flow into the canonical page registry. The user comes here to check sitemap health, run a sync, and spot listed-but-never-crawled pages.
Read brand_context and site_context first for the client and site framing. sitemaps_summary is stored evidence written by the sync command — report statuses and counts as given, never invent a document or a count; sitemap_id is set only when a single URL-set document is open on the detail route.
Sitemap documents and page-membership evidence are system-written: users only activate/deactivate or delete a document, and a deleted document reappears on the next sync that re-discovers it. Your job is to interpret coverage — a listed URL missing from crawls, a 4xx sitemap, a stale fetch — and recommend the next action, not to fabricate registry state.
</surface_intro>`,
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
  // alwaysAvailable: false → optional
  sitemap_id?: string;
  sitemaps_summary?: Array<Record<string, unknown>>;
  sitemap_pages_total?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
