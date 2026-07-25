/**
 * Surface manifest — Marketing coverage matrix (`matrx-user/marketing-coverage`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/coverage` — the
 * source-disagreement coverage matrix over the site's canonical page
 * registry (`CoverageWorkspace`). Each tile counts pages per evidence cell:
 * sitemap membership vs crawl evidence vs first-source provenance vs Google
 * Search Console coverage (in GSC / in Google not in sitemap / advertised
 * but invisible to Google). Every tile deep-links into the pages table with
 * the matching `?coverage=` filter. Inherits brand + site context from
 * `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/coverage-scope.ts (being
 * built in parallel).
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
    name: "coverage_matrix",
    label: "Coverage matrix counts",
    description:
      "The full disagreement matrix over the canonical page registry: total pages, in-sitemap / crawled / never-crawled counts, the two sitemap-vs-crawl disagreement cells, first-source provenance counts, and the three GSC cells (in GSC, in Google not in sitemap, in sitemaps invisible to Google — null when GSC has never synced). Populated once the workspace has loaded; empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 400,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "gsc_synced",
    label: "GSC ever synced",
    description:
      "True when Search Console evidence has been synced for this site at least once — the GSC cells of the matrix are only meaningful then. False when GSC is unconnected or never synced; empty during initial load.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
  },
];

export const marketingCoverageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-coverage",
  readiness: "partial",
  readinessNote: "Values emitted; no groups",
  label: "Marketing Coverage Matrix",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/coverage",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the coverage matrix of a managed website: where the evidence sources — sitemaps, crawls, first-source provenance, and Google Search Console — agree and disagree about the canonical page registry. The brand_context and site_context values give you the client and website framing; read them first.
The disagreement cells are the intelligence: pages advertised in sitemaps but never crawled, pages crawled that no sitemap advertises, pages Google serves traffic to that no sitemap mentions, and advertised pages Google never reports. Every count in coverage_matrix is derived from stored registry evidence — trust the numbers, never re-derive or estimate them.
Check gsc_synced before reasoning about the Google cells: when it is false, Search Console evidence has never been collected and those cells mean nothing yet — the right recommendation is to connect and sync GSC, not to interpret absent data.
The user triages indexation health here; each cell corresponds to a filtered page list, so recommendations should name the specific coverage cell (and its pages filter) the user should work through.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "coverage_analyst",
      label: "Coverage analyst",
      description:
        "Explains what the matrix's agreement and disagreement cells say about this site's page registry and where evidence is missing.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "indexation_strategist",
      label: "Indexation strategist",
      description:
        "Turns coverage disagreements into an indexation plan: what to add to sitemaps, what to crawl, and what to fix for Google.",
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
export function createMarketingCoverageScope(values: {
  // inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // surface-specific optionals
  coverage_matrix?: Record<string, unknown>;
  gsc_synced?: boolean;
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
