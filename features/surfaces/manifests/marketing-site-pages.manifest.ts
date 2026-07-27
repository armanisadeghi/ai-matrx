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
 * Runtime emitter: `PagesTable.tsx` mounts a nested `SurfaceRuntimeProvider`
 * and assembles its scope at trigger time from the inherited site base
 * (`features/marketing/lib/scopes/site-surface-base.tsx`) plus the loaded page
 * query. The list-query shape is shared with the hub tables via
 * `features/marketing/lib/scopes/marketing-hub-scope.ts`.
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
    key: "registry_rows",
    label: "Registry rows",
    sortOrder: 100,
    description:
      "The canonical pages the table is showing, and how many match in total.",
  },
  {
    key: "registry_query",
    label: "Registry query",
    sortOrder: 200,
    description:
      "Why these rows: the coverage chip, search, column filters, sort, and pagination the user has applied.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Registry rows (400-499) ───────────────────────────────────────────
  {
    name: "visible_pages",
    label: "Visible page rows",
    description:
      "The rows currently visible on the table's page — one entry per canonical page with its id, URL, path, observed snapshot title, registry status, provenance (how the URL entered the system), sitemap membership count, word count, last HTTP status, the three stored health verdicts (SERP metadata / social card / indexability) plus the count of passing ones, whether Google reports it, 28-day GSC clicks/impressions/position, and last-seen timestamp. A bounded sample of the registry under the active query — never the whole site. Empty during initial load and when nothing matches. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 400,
    autoContext: false,
    group: "registry_rows",
  },
  {
    name: "visible_page_count",
    label: "Visible page count",
    description:
      "How many rows are actually on the current table page — the length of visible_pages. Always smaller than or equal to pages_total; the gap is what the agent has NOT been shown. Zero when nothing matches; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "registry_rows",
  },
  {
    name: "pages_total",
    label: "Matching pages total",
    description:
      "Exact count of canonical pages matching the current filters (the table's total, not just the visible rows). Zero when the filters match nothing; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "registry_rows",
  },

  // ── Registry query (500-599) ──────────────────────────────────────────
  {
    name: "coverage_filter",
    label: "Active coverage filter",
    description:
      "The source-coverage filter chip the user has active (from `?coverage=`, e.g. pages in sitemaps never crawled, in Google but not in a sitemap). Empty when the table shows the unfiltered registry.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 500,
    group: "registry_query",
  },
  {
    name: "list_query",
    label: "Active list query",
    description:
      "The URL-owned table query behind the visible rows: { search, column_filters (status / source / sitemaps / words / HTTP / health / GSC ranges), sort {id, direction}, page, page_size, mode }. Always emitted on this surface — a default, unfiltered table still reports its sort and page. Read it before claiming anything about the site as a whole.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 250,
    sortOrder: 510,
    group: "registry_query",
  },
  {
    name: "registry_view",
    label: "Registry view",
    description:
      "The composite view descriptor for this table: { coverage_filter, pages_total, visible_page_count, query } — the whole 'what am I looking at' picture in one value, mirroring the individual values above (completeness law). Always emitted; its inner fields are null while the query is still loading.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 350,
    sortOrder: 520,
    group: "registry_query",
  },
];

export const marketingSitePagesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-pages",
  readiness: "verified",
  label: "Marketing Pages Registry",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/pages",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the canonical page registry of a managed website: one row per canonical URL, with observed snapshot evidence (title, word count), deterministic health verdicts (SERP metadata, social card, indexability), sitemap membership, and 28-day Google Search Console performance. The user comes here to triage which pages need work and to jump into a single page's workspace.
Read brand_context and site_context first for the client and site framing. visible_pages is only the rows on the current table page under the current filters and sort — a sample, never the whole site; visible_page_count is how many you were actually given and pages_total is the true filtered count, so the gap between them is what you have NOT seen. list_query (and the composite registry_view) tell you exactly which search, filters, sort, and page produced those rows; coverage_filter tells you which source-disagreement slice the user is looking at (e.g. listed in sitemaps but never crawled). Never generalize from the visible sample to the whole site without saying so.
Health verdicts and GSC metrics are stored, deterministic evidence — trust them as given, never re-derive or invent a verdict, and treat a null verdict as "not computed yet", not as a failure. When recommending priorities, ground every claim in the rows actually provided.
</surface_intro>`,
  groups,
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
  // alwaysAvailable: true → required (the table always knows its own query)
  list_query: Record<string, unknown>;
  registry_view: Record<string, unknown>;
  // alwaysAvailable: false → optional
  visible_pages?: Array<Record<string, unknown>>;
  visible_page_count?: number;
  coverage_filter?: string;
  pages_total?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
