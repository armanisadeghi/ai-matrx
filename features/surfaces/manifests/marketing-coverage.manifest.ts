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
 * Runtime emitter: `CoverageWorkspace.tsx` mounts the nested
 * `<SurfaceRuntimeProvider>` and spreads
 * `useMarketingSiteSurfaceBase().getBaseValues()` into
 * `createMarketingCoverageScope(...)` at trigger time.
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
    key: "registry_totals",
    label: "Registry totals",
    sortOrder: 100,
    description:
      "How many canonical pages exist and how many each evidence source knows about.",
  },
  {
    key: "source_disagreement",
    label: "Source disagreement",
    sortOrder: 200,
    description:
      "The cells where sitemaps and crawls contradict each other — the intelligence of this surface.",
  },
  {
    key: "provenance",
    label: "First source",
    sortOrder: 300,
    description: "Which source first recorded each canonical page.",
  },
  {
    key: "google_coverage",
    label: "Google coverage",
    sortOrder: 400,
    description:
      "What Search Console reports about this registry — meaningful only once GSC has synced.",
  },
  {
    key: "navigation",
    label: "Navigation",
    sortOrder: 500,
    description:
      "The filtered page-list destinations each coverage cell opens.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Registry totals ───────────────────────────────────────────────────
  {
    group: "registry_totals",
    name: "coverage_matrix",
    label: "Coverage matrix counts",
    description:
      "The full disagreement matrix over the canonical page registry as one object: total pages, in-sitemap / crawled / never-crawled counts, the two sitemap-vs-crawl disagreement cells, first-source provenance counts, and the three GSC cells (in GSC, in Google not in sitemap, in sitemaps invisible to Google — meaningless when GSC has never synced). Mirrors every individual coverage value as one group value. Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 400,
  },
  {
    group: "registry_totals",
    name: "total_pages",
    label: "Confirmed pages",
    description:
      "Count of canonical non-resource URLs backed by a retained crawl snapshot, sitemap membership, Search Console row, or manual assertion. This is the user-facing page total; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 410,
  },
  {
    group: "registry_totals",
    name: "known_page_urls",
    label: "All known page URLs",
    description:
      "Confirmed pages plus canonical non-resource crawl candidates that have not yet earned retained page evidence.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 412,
  },
  {
    group: "registry_totals",
    name: "unconfirmed_candidates",
    label: "Unconfirmed candidates",
    description:
      "Canonical non-resource registry URLs with no retained crawl, sitemap, Search Console, or manual page evidence. They remain auditable but are excluded from the page total.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 414,
  },
  {
    group: "registry_totals",
    name: "resource_urls",
    label: "Non-HTML resources",
    description:
      "Canonical URLs positively classified from a response as JSON, XML, PDF, image, or another non-HTML resource. They have their own page-list destination and never inflate page totals.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 416,
  },
  {
    group: "registry_totals",
    name: "in_sitemaps",
    label: "In a sitemap",
    description:
      "Count of canonical pages advertised by at least one sitemap document. Zero when no sitemap sync has run; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 420,
  },
  {
    group: "registry_totals",
    name: "crawled",
    label: "Crawled",
    description:
      "Count of canonical pages with at least one accepted crawl snapshot. Zero when no crawl has run; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 430,
  },
  {
    group: "registry_totals",
    name: "never_crawled",
    label: "Never crawled",
    description:
      "Count of canonical pages no crawl has ever captured — the registry knows the URL but has no content evidence for it. Zero when everything is captured; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 440,
  },

  // ── Source disagreement ───────────────────────────────────────────────
  {
    group: "source_disagreement",
    name: "sitemap_not_crawled",
    label: "Advertised but never crawled",
    description:
      "Count of pages a sitemap advertises that no crawl has captured — the site claims them but we have no evidence of what they serve. Zero when the crawl covers every advertised URL; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 450,
  },
  {
    group: "source_disagreement",
    name: "crawled_no_sitemap",
    label: "Crawled but unadvertised",
    description:
      "Count of pages a crawl captured that no sitemap advertises — real pages the site does not declare to search engines. Zero when the sitemaps are complete; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 460,
  },

  // ── First source ──────────────────────────────────────────────────────
  {
    group: "provenance",
    name: "pages_by_provenance",
    label: "Pages by first source",
    description:
      "Count of canonical pages per first-recording source: { sitemap, crawl, gsc, manual }. Answers how each URL entered the registry. Empty during initial load; individual keys are zero when that source has never contributed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 470,
  },

  // ── Google coverage ───────────────────────────────────────────────────
  {
    group: "google_coverage",
    name: "gsc_synced",
    label: "GSC ever synced",
    description:
      "True when Search Console evidence has been synced for this site at least once — the GSC cells of the matrix are only meaningful then. False when GSC is unconnected or never synced; empty during initial load.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
  },
  {
    group: "google_coverage",
    name: "in_gsc",
    label: "Reported by Google",
    description:
      "Count of canonical pages Search Console reports impressions or clicks for. Zero when GSC reports none; meaningless (and the tiles are hidden) when gsc_synced is false.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 610,
  },
  {
    group: "google_coverage",
    name: "gsc_no_sitemap",
    label: "In Google, not in a sitemap",
    description:
      "Count of pages Google serves that no sitemap advertises — traffic the site is not declaring. Zero when the sitemaps cover everything Google reports; meaningless when gsc_synced is false.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 620,
  },
  {
    group: "google_coverage",
    name: "sitemap_no_gsc",
    label: "Advertised, invisible to Google",
    description:
      "Count of sitemap-advertised pages Search Console never reports — declared but earning nothing in search. Zero when Google reports every advertised page; meaningless when gsc_synced is false.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 630,
  },

  // ── Navigation ────────────────────────────────────────────────────────
  {
    group: "navigation",
    name: "coverage_filters",
    label: "Coverage filter destinations",
    description:
      "The filtered page-list destination behind every tile: per cell its filter key, human label, current count, and the pages-table URL that lists exactly those pages. Use it to name a concrete destination when recommending work. Always emitted once the workspace has loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    autoContext: false,
    sortOrder: 700,
  },
];

export const marketingCoverageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-coverage",
  readiness: "verified",
  label: "Marketing Coverage Matrix",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/coverage",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the coverage matrix of a managed website: where the evidence sources — sitemaps, crawls, first-source provenance, and Google Search Console — agree and disagree about the canonical page registry. The brand_context and site_context values give you the client and website framing; read them first.
The disagreement cells are the intelligence: pages advertised in sitemaps but never crawled, pages crawled that no sitemap advertises, pages Google serves traffic to that no sitemap mentions, and advertised pages Google never reports. Every count in coverage_matrix is derived from stored registry evidence — trust the numbers, never re-derive or estimate them.
Check gsc_synced before reasoning about the Google cells: when it is false, Search Console evidence has never been collected and those cells mean nothing yet — the right recommendation is to connect and sync GSC, not to interpret absent data.
The user triages indexation health here; each cell corresponds to a filtered page list, so recommendations should name the specific coverage cell (and its pages filter) the user should work through — coverage_filters carries every cell's filter key, count, and destination URL.
</surface_intro>`,
  groups,
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
  total_pages?: number;
  known_page_urls?: number;
  unconfirmed_candidates?: number;
  resource_urls?: number;
  in_sitemaps?: number;
  crawled?: number;
  never_crawled?: number;
  sitemap_not_crawled?: number;
  crawled_no_sitemap?: number;
  pages_by_provenance?: Record<string, unknown>;
  gsc_synced?: boolean;
  in_gsc?: number;
  gsc_no_sitemap?: number;
  sitemap_no_gsc?: number;
  coverage_filters?: Array<Record<string, unknown>>;
  // inherited optionals
  brand_name?: string;
  gsc_synced_at?: string;
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
