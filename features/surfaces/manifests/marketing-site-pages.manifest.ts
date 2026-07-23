/**
 * Surface manifest — Marketing pages registry (`matrx-user/marketing-site-pages`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/pages` — the canonical
 * page registry table of one managed website (`features/marketing`,
 * `PagesTable` over the `web.v_page_list` projection). Each row is one
 * canonical URL with its observed snapshot title, word count, three health
 * verdicts (SERP metadata / social card / indexability), sitemap membership
 * count, and rolling 28-day Google Search Console clicks/impressions/position.
 * URL-owned `?coverage=` chips filter the registry by source-coverage
 * disagreement (the tiles on the Coverage workspace deep-link here). Inherits
 * the brand + site context blocks from `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/site-pages-scope.ts — being
 * built in parallel.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "visible_pages",
    label: "Visible page rows",
    description:
      "The rows currently visible on the table's page: URL, observed title, health verdicts (SERP / social / indexability), sitemap count, word count, and 28-day GSC clicks/impressions/position per row. A bounded sample of the registry — not the whole site. Empty during initial load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 400,
    autoContext: false,
  },

  // ── User intent (500-549) ─────────────────────────────────────────────
  {
    name: "coverage_filter",
    label: "Active coverage filter",
    description:
      "The source-coverage filter chip the user has active (from `?coverage=`, e.g. pages in sitemaps never crawled, in Google but not in a sitemap). Empty when the table shows the unfiltered registry.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 500,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "pages_total",
    label: "Matching pages total",
    description:
      "Exact count of canonical pages matching the current filters (the table's total, not just the visible rows). Zero when the filters match nothing; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
  },
];

export const marketingSitePagesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-pages",
  label: "Marketing Pages Registry",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/pages",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the canonical page registry of a managed website: one row per canonical URL, with observed snapshot evidence (title, word count), deterministic health verdicts (SERP metadata, social card, indexability), sitemap membership, and 28-day Google Search Console performance. The user comes here to triage which pages need work and to jump into a single page's workspace.
Read brand_context and site_context first for the client and site framing. visible_pages is only the rows on the current table page under the current filters and sort — a sample, never the whole site; pages_total is the true filtered count. coverage_filter tells you which source-disagreement slice the user is looking at (e.g. listed in sitemaps but never crawled).
Health verdicts and GSC metrics are stored, deterministic evidence — trust them as given, never re-derive or invent a verdict, and treat a null verdict as "not computed yet", not as a failure. When recommending priorities, ground every claim in the rows actually provided.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "content_planner",
      label: "Content planner",
      description:
        "Turns the registry's coverage and health picture into a concrete content plan — which pages to improve, merge, or create.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "keyword_strategist",
      label: "Keyword strategist",
      description:
        "Maps target keywords across the visible pages using GSC performance and observed titles, flagging gaps and cannibalization.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "priority_triager",
      label: "Priority triager",
      description:
        "Ranks the filtered pages by impact — health verdicts, traffic, and coverage disagreements — into a short ordered work queue.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited `brand_id` + `site_id` from the marketing-brand → marketing-site
 * chain.
 */
export function createMarketingSitePagesScope(values: {
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
  visible_pages?: Array<Record<string, unknown>>;
  coverage_filter?: string;
  pages_total?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
