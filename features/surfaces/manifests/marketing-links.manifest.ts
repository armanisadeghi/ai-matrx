/**
 * Surface manifest — Marketing site links workspace (`matrx-user/marketing-links`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/links` — the site-scoped
 * link intelligence workspace (`LinksInspectionTable` composing the
 * `link-graph` views). Three views over the same immutable `web.link_edge`
 * evidence, selected by `?view=`: the interactive link GRAPH (default), the
 * domain-grouped EXTERNAL outbound report, and the raw edge TABLE.
 * Crawl-scoped link views live under the crawl routes and resolve to
 * `matrx-user/marketing-crawl`, not here. Inherits brand + site context from
 * `matrx-user/marketing-site`.
 *
 * Runtime emitter: `LinksInspectionTable` mounts the nested
 * `SurfaceRuntimeProvider` (site-scoped only — the crawl-scoped variant hands
 * off to `CrawlSurfaceProvider`) and spreads
 * `useMarketingSiteSurfaceBase()`'s base values into
 * `createMarketingLinksScope` at trigger time.
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
    key: "link_graph",
    label: "Link graph",
    sortOrder: 100,
    description:
      "The shape of the site's observed internal link graph across all retained snapshots.",
  },
  {
    key: "outbound",
    label: "Outbound links",
    sortOrder: 200,
    description: "Where this site sends authority — its external destinations.",
  },
  {
    key: "link_edges",
    label: "Link edge rows",
    sortOrder: 300,
    description:
      "The raw immutable edge records the Table view lists, and how many match.",
  },
  {
    key: "links_view",
    label: "Links view",
    sortOrder: 400,
    description:
      "Which of the three views the user is on and how the edge table is sliced.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Link graph ────────────────────────────────────────────────────────
  {
    name: "link_totals",
    label: "Link graph totals",
    description:
      "Composite aggregate over the site's observed link evidence: { edges, edges_loaded, truncated, internal_pages, external_domains, nofollow_links, broken_links }. Mirrors the individual graph values as one object (completeness law). Populated once the active view has loaded its edges; empty during initial load or before any snapshot has recorded links.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 300,
    group: "link_graph",
  },
  {
    name: "edge_total",
    label: "Total edges",
    description:
      "Total number of link edges recorded for this site across retained snapshots. Empty until the graph query has loaded; zero when no snapshot has persisted links.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 310,
    group: "link_graph",
  },
  {
    name: "edges_loaded",
    label: "Edges loaded",
    description:
      "How many edges the graph query actually fetched — capped at a hard row limit, so it can be lower than edge_total. Empty until the graph query has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 320,
    group: "link_graph",
  },
  {
    name: "graph_truncated",
    label: "Graph truncated",
    description:
      "True when the edge cap was hit and the loaded edges are a partial view of the site's links — every derived total below is then a floor, not the truth. Empty until the graph query has loaded.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "link_graph",
  },
  {
    name: "internal_page_count",
    label: "Internal pages in graph",
    description:
      "Distinct internal pages appearing in the loaded edges, as source or resolved target. Empty until edges have loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 340,
    group: "link_graph",
  },
  {
    name: "broken_link_count",
    label: "Broken links",
    description:
      "Loaded edges whose recorded HTTP status is 400 or above — links the crawler found broken. Zero when none; empty until edges have loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 350,
    group: "link_graph",
  },
  {
    name: "nofollow_link_count",
    label: "Nofollow links",
    description:
      'Loaded edges whose rel attribute contains "nofollow". Zero when none; empty until edges have loaded.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 360,
    group: "link_graph",
  },

  // ── Outbound links ────────────────────────────────────────────────────
  {
    name: "external_domain_count",
    label: "External domains",
    description:
      "Distinct outbound destination domains across the loaded edges. Zero when the site links nowhere external; empty until edges have loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "outbound",
  },
  {
    name: "external_domains_top",
    label: "Top external domains",
    description:
      "The top outbound destination domains by link count, each with its distinct linking pages and nofollow share (the External view's rollup). Populated once edges have loaded; empty when the site has no recorded outbound links.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 410,
    group: "outbound",
  },

  // ── Link edge rows ────────────────────────────────────────────────────
  {
    name: "link_rows",
    label: "Loaded link edges",
    description:
      "The raw edge rows the Table view currently lists: source URL, target URL, internal/external scope, HTTP status, anchor text, rel, position, and snapshot id. Empty unless the user is on the Table view (the Graph and External views never load these rows).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 500,
    group: "link_edges",
  },
  {
    name: "link_rows_total",
    label: "Matching edge count",
    description:
      "Total number of edge rows matching the Table view's filters (not just the visible page). Empty unless the user is on the Table view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 510,
    group: "link_edges",
  },
  {
    name: "link_rows_loaded",
    label: "Loaded row count",
    description:
      "How many edge rows the current table page holds — the size of link_rows. Empty unless the user is on the Table view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 520,
    group: "link_edges",
  },

  // ── Links view ────────────────────────────────────────────────────────
  {
    name: "view_mode",
    label: "Active links view",
    description:
      '"graph" | "external" | "table" — which of the three link views the user is looking at (from `?view=`; graph is the default when the parameter is absent). Always set once the workspace has rendered.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 600,
    group: "links_view",
  },
  {
    name: "active_filters",
    label: "Active edge filters",
    description:
      "The Table view's current search and per-column filter state (target URL, scope, HTTP status, anchor, rel, position) as the URL carries it. Empty on the unfiltered default view or when the user is not on the Table view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    autoContext: false,
    sortOrder: 610,
    group: "links_view",
  },
  {
    name: "links_view_state",
    label: "Edge table view state",
    description:
      "Composite of the edge table's slice: { search, any_of, filters, sort, page, page_size }. Empty unless the user is on the Table view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    autoContext: false,
    sortOrder: 620,
    group: "links_view",
  },
];

export const marketingLinksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-links",
  readiness: "verified",
  label: "Marketing Site Links",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/links",
  inheritsFrom: "matrx-user/marketing-site",
  groups,
  intro: `<surface_intro>
You are on the link intelligence workspace of a managed website: every internal and outbound link observed across the site's retained crawl snapshots, viewed as an interactive site graph (default), a domain-grouped outbound report, or a raw edge table — view_mode tells you which. The brand_context and site_context values give you the client and website framing; read them first.
Only the Table view loads raw edge rows (link_rows) — on the Graph and External views those values are absent by design, while link_totals and external_domains_top describe the whole loaded graph. When graph_truncated is true the edge cap was hit and every derived count is a floor, not the truth: say so rather than reporting it as complete.
Link edges are IMMUTABLE OBSERVED EVIDENCE from crawl snapshots — they describe what the live site actually links to, and they are never edited or invented. Use link_totals for the shape of the graph and external_domains_top for where the site sends authority.
The user works here on internal linking structure (orphan pages, click depth, hub pages) and on auditing outbound links (which domains, dofollow vs nofollow). When you propose changes — new internal links, rel attributes, removals — you are proposing edits for the user to make on the site; the observed graph only changes after a new crawl records it.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "internal_linking_strategist",
      label: "Internal linking strategist",
      description:
        "Improves the site's internal link structure: orphan pages, click depth, hub-and-spoke opportunities, and anchor text.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "outbound_link_auditor",
      label: "Outbound link auditor",
      description:
        "Audits where the site links out: destination domains, dofollow/nofollow policy, and risky or broken outbound targets.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited brand_id / site_id from marketing-brand / marketing-site.
 */
export function createMarketingLinksScope(values: {
  // inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // alwaysAvailable: true → required
  view_mode: string;
  // surface-specific optionals
  link_totals?: Record<string, unknown>;
  edge_total?: number;
  edges_loaded?: number;
  graph_truncated?: boolean;
  internal_page_count?: number;
  broken_link_count?: number;
  nofollow_link_count?: number;
  external_domain_count?: number;
  external_domains_top?: Array<Record<string, unknown>>;
  link_rows?: Array<Record<string, unknown>>;
  link_rows_total?: number;
  link_rows_loaded?: number;
  active_filters?: Record<string, unknown>;
  links_view_state?: Record<string, unknown>;
  // inherited optionals
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // baseline optionals
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
