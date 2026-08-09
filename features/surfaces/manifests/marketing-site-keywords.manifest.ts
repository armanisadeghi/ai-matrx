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
 * The EVIDENCE here is read-only. Collection (GSC/Bing sync) and market
 * enrichment are explicit compute operations elsewhere; nothing here fetches
 * provider data. What IS agent-writable is the site's judgment ABOUT the
 * evidence — library membership, the site traffic-class ruling, and which
 * page a query belongs to — declared as `writeTargets` below (handlers:
 * `SiteKeywordsWriteTargets.tsx`). It inherits brand + site context from
 * `matrx-user/marketing-site`.
 *
 * Runtime scope assembly: `features/marketing/lib/scopes/site-keywords-scope.ts`
 * (emitter in `SiteKeywordPerformanceWorkspace.tsx`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
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

/**
 * The WRITE half — the site's judgment about its query evidence. Every target
 * persists immediately through a CANONICAL chokepoint the keyword plane
 * already uses (`ensureKeywordId` → `seo.fn_upsert_keyword`,
 * `setGscKeywordClass` → `seo.gsc_set_keyword_class`,
 * `addPageSupportingKeywords`), so every entity write defaults to `ask` — an
 * agent triaging the site's queries is welcome, an agent silently rewriting
 * site rulings is not. Handlers: `SiteKeywordsWriteTargets.tsx` (mounted by
 * `SiteKeywordPerformanceWorkspace`).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "library_keywords",
    label: "Add to keyword library",
    description:
      "Add keyword phrases to the canonical keyword library so this site's matching query rows become mapped (keyword_id, archive, intelligence, and market enrichment all need a library row). Value: { keywords: string[] } — plain phrases, typically queries from visible_keyword_rows that show no workflow status or market data yet. Each phrase is upserted through the ONE canonical seo.fn_upsert_keyword (deduped by normalized phrase); already-present phrases are a no-op and archived phrases are restored. Persists immediately.",
    valueType: "object",
    updatesValue: "visible_keyword_rows",
    mode: "entity",
    applyPolicy: "ask",
    group: "query_evidence",
    sortOrder: 100,
  },
  {
    name: "keyword_traffic_class",
    label: "Traffic class ruling",
    description:
      "Apply this SITE's traffic-class ruling to one or more keywords — the 'not all traffic is created equal' judgment that drives Traffic quality / Shifts / Juice. Value: { keywords: string[], traffic_class: 'money' | 'educational' | 'brand' | 'mismatch' | 'clear', notes?: string }. keywords are plain phrases (queries from visible_keyword_rows); notes is REQUIRED for 'mismatch' (server-enforced) and explains why the traffic is mis-matched; 'clear' removes the site ruling so the machine rungs (brand match, AI intent) decide again. Persists immediately through seo.gsc_set_keyword_class with AI provenance; a 'mismatch' ruling also suppresses the keyword's workflow_status on this table.",
    valueType: "object",
    updatesValue: "visible_keyword_rows",
    mode: "entity",
    applyPolicy: "ask",
    group: "query_evidence",
    sortOrder: 110,
  },
  {
    name: "attach_page_keywords",
    label: "Attach keywords to page",
    description:
      "Attach keyword phrases to ONE canonical page of this site as supporting keywords (the page's keyword batch). Value: { page_id: string, keywords: string[] } — page_id is a web.page id, typically a row's top_page_id (the page already ranking for the query). Each phrase is upserted into the keyword library and associated through the canonical chokepoint (addPageSupportingKeywords); duplicates are deduplicated and already-attached phrases are a no-op. Persists immediately; the batch shows on that page's workspace, not on this table.",
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "query_evidence",
    sortOrder: 120,
  },
];

export const marketingSiteKeywordsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-keywords",
  label: "Organic Keyword Performance",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/keywords",
  inheritsFrom: "matrx-user/marketing-site",
  readiness: "verified",
  readinessNote:
    "Registered (registry.ts + route-to-surface.ts) and live-agent verified end-to-end, including all three write targets (apply, decline, undeclared-target refusal).",
  intro: `<surface_intro>
Read brand_context and site_context first — they tell you whose site this is and what it sells.
You are on the organic keyword performance workspace for ONE managed website: the search queries it has ACTUALLY earned impressions and clicks for, as persisted from Google Search Console and Bing Webmaster over a rolling 28-day window, enriched with stored keyword-market metrics (volume, CPC, competition) and the site's own keyword workflow status.
visible_keyword_rows is only the current table page under table_query's search/filters/sort — a sample. matching_queries_total is the true filtered count; never describe the visible rows as the site's whole query footprint.
Every metric here is stored provider evidence. Trust it as given, never re-derive or invent a number, and read an empty result as "not synced yet" rather than "the site ranks for nothing". The strongest matched page per query is the site's best current answer to that query — cannibalization, mismatched intent, and near-page-one positions are the highest-value things to point out.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
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
