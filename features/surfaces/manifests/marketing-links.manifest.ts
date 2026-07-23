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
 * Runtime emitter: features/marketing/lib/scopes/links-scope.ts (being built
 * in parallel).
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
    name: "link_totals",
    label: "Link graph totals",
    description:
      "Aggregate counts over the site's observed link evidence: internal pages in the graph, unique edges, external target domains, broken/orphan counts, and nofollow link counts. Populated once the active view has loaded its edges; empty during initial load or before any snapshot has recorded links.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 400,
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
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "view_mode",
    label: "Active links view",
    description:
      '"graph" | "external" | "table" — which of the three link views the user is looking at (from `?view=`; graph is the default when the parameter is absent). Empty during initial load.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 600,
  },
];

export const marketingLinksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-links",
  label: "Marketing Site Links",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/links",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the link intelligence workspace of a managed website: every internal and outbound link observed across the site's retained crawl snapshots, viewed as an interactive site graph (default), a domain-grouped outbound report, or a raw edge table — view_mode tells you which. The brand_context and site_context values give you the client and website framing; read them first.
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
  // surface-specific optionals
  view_mode?: string;
  link_totals?: Record<string, unknown>;
  external_domains_top?: Array<Record<string, unknown>>;
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
