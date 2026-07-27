/**
 * Surface manifest — Organic keyword performance (`matrx-user/marketing-site-keywords`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/keywords` —
 * `SiteKeywordPerformanceWorkspace` over `seo.v_site_keyword_performance`:
 * the persisted 28-day search-query evidence for ONE site (Google Search
 * Console + Bing Webmaster), joined to canonical keyword-market metrics and
 * the site-specific keyword workflow status, with the strongest matched page
 * per query.
 *
 * This is a READ surface. Collection (GSC/Bing sync) and market enrichment are
 * explicit compute operations elsewhere; nothing here fetches provider data.
 * It inherits brand + site context from `matrx-user/marketing-site`.
 *
 * Runtime scope assembly: `features/marketing/lib/scopes/site-keywords-scope.ts`
 * (emitter in `SiteKeywordPerformanceWorkspace.tsx`).
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
    key: "query_evidence",
    label: "Query evidence",
    sortOrder: 100,
    description:
      "The stored search-query rows this site actually earned, as currently listed.",
  },
  {
    key: "table_view",
    label: "Table view",
    sortOrder: 200,
    description:
      "How the user has narrowed the evidence: search, filters, sort, and page.",
  },
  {
    key: "sources",
    label: "Sources",
    sortOrder: 300,
    description: "Which search-performance providers feed this workspace.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Query evidence ─────────────────────────────────────────────────────
  {
    name: "visible_keyword_rows",
    label: "Visible query rows",
    description:
      "The `seo.v_site_keyword_performance` rows on the current table page: provider, query, clicks, impressions, ctr, average_position, stored window (first/last date), market metrics (search_volume, cpc, competition), strongest matched page (path + id), and site workflow_status. A bounded page under the active filters — never the whole site. Empty array while loading or when nothing matches.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "query_evidence",
    sortOrder: 300,
  },
  {
    name: "matching_queries_total",
    label: "Matching queries",
    description:
      "Exact count of stored queries matching the current filters for this site (the table's true total, not just the visible page). Zero when nothing matches or no performance sync has run.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "query_evidence",
    sortOrder: 310,
  },

  // ── Table view ─────────────────────────────────────────────────────────
  {
    name: "table_query",
    label: "Table query state",
    description:
      "The user's current narrowing of the evidence: { search, sort (column + direction), columnFilters (provider, competition, workflow status, numeric ranges), page, pageSize }. Always present — it carries the defaults (sorted by clicks, 50 per page) even when untouched.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "table_view",
    sortOrder: 400,
  },

  // ── Sources ────────────────────────────────────────────────────────────
  {
    name: "site_domain",
    label: "Site domain",
    description:
      "Domain of the site whose organic performance is shown (e.g. example.com). Always present — the site layout resolves the site before this workspace renders.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 25,
    group: "sources",
    sortOrder: 500,
  },
  {
    name: "bing_connected",
    label: "Bing Webmaster connected",
    description:
      "True when this site has an enabled Bing Webmaster binding, so Bing query evidence can be synced from here. False when only Google Search Console (or nothing) is connected.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "sources",
    sortOrder: 510,
  },
];

export const marketingSiteKeywordsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-keywords",
  label: "Organic Keyword Performance",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/keywords",
  inheritsFrom: "matrx-user/marketing-site",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter complete for everything this read surface loads. Not yet registered in registry.ts / route-to-surface.ts / ui_surface (registration is the owner's call).",
  intro: `<surface_intro>
Read brand_context and site_context first — they tell you whose site this is and what it sells.
You are on the organic keyword performance workspace for ONE managed website: the search queries it has ACTUALLY earned impressions and clicks for, as persisted from Google Search Console and Bing Webmaster over a rolling 28-day window, enriched with stored keyword-market metrics (volume, CPC, competition) and the site's own keyword workflow status.
visible_keyword_rows is only the current table page under table_query's search/filters/sort — a sample. matching_queries_total is the true filtered count; never describe the visible rows as the site's whole query footprint.
Every metric here is stored provider evidence. Trust it as given, never re-derive or invent a number, and read an empty result as "not synced yet" rather than "the site ranks for nothing". The strongest matched page per query is the site's best current answer to that query — cannibalization, mismatched intent, and near-page-one positions are the highest-value things to point out.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  agentRoles: [
    {
      name: "keyword_strategist",
      label: "Keyword strategist",
      description:
        "Turns the site's real query evidence into targeting decisions: which queries to own, which page should own them, and where intent is mismatched.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "opportunity_triager",
      label: "Opportunity triager",
      description:
        "Ranks the visible queries by upside — impressions with poor CTR, positions just off page one, high-volume queries with a weak matched page.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "cannibalization_auditor",
      label: "Cannibalization auditor",
      description:
        "Finds queries whose strongest matched page conflicts with other pages or with the query's intent, and recommends consolidation.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the inherited
 * `brand_id` + `site_id` from the marketing-brand → marketing-site chain.
 */
export function createMarketingSiteKeywordsScope(values: {
  // alwaysAvailable: true → required (inherited)
  brand_id: string;
  site_id: string;
  // alwaysAvailable: true → required (own)
  table_query: Record<string, unknown>;
  site_domain: string;
  bing_connected: boolean;
  // Inherited optionals (marketing-brand + marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // alwaysAvailable: false → optional
  visible_keyword_rows?: Array<Record<string, unknown>>;
  matching_queries_total?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
