/**
 * Surface manifest — Marketing hub (`matrx-user/marketing`).
 *
 * The hub-level surface of the Marketing system: every `/marketing/*` route
 * that is NOT scoped to one brand, site, or batch resolves here
 * (`features/surfaces/utils/route-to-surface.ts`). Four views own real data
 * and emit into this scope:
 *
 *   • `/marketing`             — the pillar map (`MarketingHub`), the feature's
 *                                own table of contents.
 *   • `/marketing/brands`      — the brand portfolio (`BrandsPortfolio`).
 *   • `/marketing/sites`       — the flattened managed-site list
 *                                (`SitesPortfolio`).
 *   • `/marketing/connections` — the Google / Bing connection catalog
 *                                (`MarketingConnectionsCatalog`).
 *   • `/marketing/cost`        — runtime cost rollups + provider spend
 *                                (`WorkspaceCostWorkspace`).
 *
 * No brand or site is in focus here — the routes carry no params, so NOTHING
 * is guaranteed and every value is an aggregate over whatever the currently
 * open hub view has loaded. `hub_view` tells the agent which of them that is.
 *
 * Runtime emitters (all client components, scope assembled at trigger time):
 * `MarketingHub.tsx`, `BrandsPortfolio.tsx`, `SitesPortfolio.tsx`,
 * `MarketingConnectionsCatalog.tsx`, `WorkspaceCostWorkspace.tsx`. The shared
 * list-state helper lives in `features/marketing/lib/scopes/marketing-hub-scope.ts`.
 *
 * The WRITE half is deliberately narrower than the read half: only the sites
 * view registers a handler. See the `writeTargets` block below — which mount
 * writes and why the other four write nothing is the load-bearing decision on
 * this surface, not a detail.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  SITE_DESCRIPTION_MAX,
  SITE_NAME_MAX,
} from "@/features/marketing/lib/site-write-targets";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "hub_map",
    label: "Hub map",
    sortOrder: 100,
    description:
      "Which hub view is open and the map of every Marketing surface the user can reach from here.",
  },
  {
    key: "portfolio",
    label: "Portfolio",
    sortOrder: 200,
    description:
      "The brands and managed websites the user can access, as currently listed.",
  },
  {
    key: "connections",
    label: "Connections",
    sortOrder: 300,
    description:
      "Search-engine account connections (Google, Bing) and how many sites are wired to them.",
  },
  {
    key: "cost",
    label: "Cost",
    sortOrder: 400,
    description:
      "Runtime cost rollups and provider spend across the whole workspace.",
  },
  {
    key: "workspace_state",
    label: "Workspace state",
    sortOrder: 500,
    description:
      "The list query driving whichever hub table is on screen: search, filters, sort, pagination.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Hub map ───────────────────────────────────────────────────────────
  {
    name: "hub_view",
    label: "Hub view",
    description:
      "Which hub-level view the user is on: `map` (/marketing), `brands`, `sites`, `connections`, or `cost`. Empty on hub routes that have no emitter yet (the reserved Coming Soon routes, e.g. campaigns, analytics) — treat that as 'view unknown', never as 'no view open'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 300,
    group: "hub_map",
  },
  {
    name: "hub_pillars",
    label: "Marketing pillar map",
    description:
      "The declared structure of the whole Marketing feature as rendered on /marketing: one entry per pillar with its label, description, and its surfaces (label, href, description, and whether the surface is live or reserved as coming-soon). Emitted on the /marketing hub landing only; empty on the other hub views. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 310,
    group: "hub_map",
  },

  // ── Portfolio ─────────────────────────────────────────────────────────
  {
    name: "brand_count",
    label: "Brand count",
    description:
      "Exact number of brands matching the brand list's current search and filters (the table total, not just the visible rows). Emitted on the brands view; empty elsewhere or during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 400,
    group: "portfolio",
  },
  {
    name: "visible_brands",
    label: "Visible brand rows",
    description:
      "The brand rows on the current page of the brands table: name, industry, description, status, its websites (id + domain), social/asset/business-fact counts, pending discovery reviews, and last update. A bounded sample under the active search, filters, sort, and page — never the whole portfolio. Empty on other hub views and during initial load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 410,
    group: "portfolio",
  },
  {
    name: "portfolio_summary",
    label: "Portfolio summary",
    description:
      "The condensed triage rollup of the loaded brand rows: per brand its id, name, status, site domains, and pending discovery-review count — the 'which client needs attention' picture. Same rows as visible_brands, minus the detail. Empty on other hub views and during initial load. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 420,
    group: "portfolio",
  },
  {
    name: "site_count",
    label: "Managed site count",
    description:
      "Total number of managed websites the user can access, ignoring any list filters. Emitted on the sites view; empty elsewhere or while the count query is loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 430,
    group: "portfolio",
  },
  {
    name: "sites_total",
    label: "Matching site total",
    description:
      "Exact number of managed websites matching the sites list's current search and filters. Equal to site_count when nothing is filtered; zero when the filters match nothing. Empty on other hub views and during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 440,
    group: "portfolio",
  },
  {
    name: "visible_sites",
    label: "Visible site rows",
    description:
      "The managed-website rows on the current page of the sites table: id, brand id, name, domain, root URL, description, status, visibility, whether it has been initialized, its stored health score and scored-page count, and last update. A bounded sample under the active search/filters/sort/page. Empty on other hub views and during initial load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 450,
    group: "portfolio",
  },
  {
    name: "site_editor",
    label: "Open site editor",
    description:
      "The site editor dialog on the sites view while it is open: { site_id, domain, name, description } as CURRENTLY STAGED, including edits the user or an agent has made but not yet saved. Empty whenever no editor is open — which is the normal state — so treat empty as 'no editor is open', never as 'the site has no name'. This is the read twin of the site_editor_draft write target.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 460,
    group: "portfolio",
  },

  // ── Connections ───────────────────────────────────────────────────────
  {
    name: "connection_status",
    label: "Connection status",
    description:
      "The search-engine connection picture rendered on /marketing/connections: for Google, connected account count, available Search Console properties, sites configured for Search Console, and sites with PageSpeed Insights enabled; for Bing, connected account count, discovered properties, and sites bound. A third `sites` block carries the managed-site option list's own loading state and total. Every block carries `loading` / `unavailable` flags — an unavailable inventory means the check failed, NOT that nothing is connected. Emitted on the connections view only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 500,
    group: "connections",
  },

  // ── Cost ──────────────────────────────────────────────────────────────
  {
    name: "cost_view",
    label: "Cost view",
    description:
      "Which cost view is open on /marketing/cost. Always `seo_spend` (provider spend) — the only cost view the page carries since the never-populated runtime rollup was retired (D149). Empty on other hub views.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 600,
    group: "cost",
  },

  // ── Workspace state ───────────────────────────────────────────────────
  {
    name: "list_query",
    label: "Active list query",
    description:
      "The URL-owned query driving whichever hub table is on screen (brands, sites, or cost): { search, column_filters, sort {id, direction}, page, page_size, mode }. Explains WHY the visible rows are the ones supplied. Empty on hub views with no table (the pillar map, connections).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 700,
    group: "workspace_state",
  },
];

/**
 * Write targets — THE PER-MOUNT POSTURE IS THE POINT HERE.
 *
 * Five components mount this one surface, and `listAgentWritableTargets()`
 * only offers a target where a handler is actually REGISTERED. So the
 * decision is made mount by mount, and four of the five deliberately register
 * nothing:
 *
 *  • `SitesPortfolio` (/marketing/sites) — THE ONLY WRITER. It owns the site
 *    editor dialog, whose `name` and `description` are the only authored copy
 *    anywhere on this surface. Handlers live there; the pure contract is
 *    `features/marketing/lib/site-write-targets.ts` (unit-tested), whose
 *    constants this manifest interpolates into the model-facing description
 *    below so the advertised contract IS the enforced one.
 *  • `BrandsPortfolio` (/marketing/brands) — NO handlers, and that is a
 *    judgment recorded rather than an oversight. Its `BrandEditorDialog`
 *    edits exactly { name, industry, description }, and
 *    `matrx-user/marketing-brand` ALREADY ships `brand_identity` over
 *    { industry, description } through `updateBrand` with the version guard.
 *    Two target sets over the same fields is a defect, not coverage. That
 *    surface also declares the brand NAME human-owned identity; contradicting
 *    it from the hub would be worse than declaring nothing. Organization and
 *    visibility are ownership/permissions. The brand cockpit is where brand
 *    copy gets written — the hub's brand editor earns nothing.
 *  • `MarketingConnectionsCatalog` (/marketing/connections) — NO handlers.
 *    Its state is provider credentials and Search Console / Bing property
 *    ids: pure IDENTITY, binding a real analytics account to a real site.
 *    Never agent-writable at any policy.
 *  • `WorkspaceCostWorkspace` (/marketing/cost) — NO handlers. A spend
 *    report; there is nothing to author.
 *  • `MarketingHub` (/marketing) — NO handlers. The pillar map is navigation.
 *
 * Deliberately NOT writable on the site editor either, though these fields
 * sit inches from the two that are:
 *  • `root_url` / `domain` — the identity of the row. The editor itself shows
 *    them read-only: changing one is a page-registry migration, not an edit.
 *  • `brand_id` and the owning organization — ownership.
 *  • `logo_url` / `favicon_url` / `og_image_url` — the line
 *    `matrx-user/html-page` already drew on `og_image`: an agent can only
 *    invent a plausible URL.
 *  • `status` / `visibility` — pausing a site governs whether metered crawl
 *    and scan work runs, `error` is written by the system, and visibility is
 *    permissions. `matrx-user/marketing-brand` drew the same line.
 *  • Deleting a site stays human, and so does creating one: /marketing/sites/new
 *    mounts no runtime, and its only non-identity field is a display name
 *    that already defaults to the domain.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "site_editor_draft",
    label: "Site editor draft",
    description:
      `Stage a managed website's display name and/or description into the site editor on /marketing/sites. Nothing is persisted by this write — the user reviews the dialog and presses "Save site". Value: an object { site, name?, description? }. ` +
      `\`site\` is REQUIRED and says WHICH loaded row to edit: its domain ("example.com", with or without scheme/www), its site_id, or its exact name from the visible_sites value. An unknown or ambiguous selector is refused with the loaded rows listed — and because that list is filtered and paginated, a site that exists may simply not be on this page. ` +
      `Supply at least one of \`name\` (the display label the portfolio lists it under, 1-${SITE_NAME_MAX} characters) or \`description\` (prose saying what the website is FOR, up to ${SITE_DESCRIPTION_MAX} characters; an empty string clears it). Both are PLAIN TEXT strings — never JSON and never JSON-encoded. Omitted keys keep whatever is currently in the editor. ` +
      `If no editor is open this opens one on the named site; if an editor is already open on a DIFFERENT site the write is refused rather than discarding that unsaved work. The site's domain, root URL, owning brand, organization, lifecycle status, visibility and image URLs are NOT writable here.`,
    valueType: "object",
    updatesValue: "site_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "portfolio",
    sortOrder: 100,
  },
];

export const marketingManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing",
  readiness: "partial",
  readinessNote:
    "The five hub views that own data (pillar map, brands, sites, connections, cost) are fully declared, grouped, and emitted. Every OTHER hub-level route that resolves here is a reserved Coming Soon placeholder rendering <MarketingComingSoon> with no data at all — /marketing/analytics, /marketing/campaigns, /marketing/content-studio, /marketing/reports, /marketing/social, /marketing/email — so none of them warrants a surface until it grows real data (audited 2026-07-27). The hub-level routes that DO own data have their own surfaces: /marketing/keyword-research (matrx-user/keyword-research), /marketing/ranks (matrx-user/marketing-ranks-hub, the cross-site rank hub shipped 2026-07-28), and /marketing/competitors (matrx-user/marketing-competitors — the competitor opportunity autopsy, which stopped being a placeholder 2026-08-11 when its workspace finally got a route). Site-scoped rank tracking has its own surface, matrx-user/marketing-ranks. /marketing/batches and matrx-user/marketing-batches were retired 2026-08-11 (D149): they read the never-populated web.batch_* spine, which no longer exists.",
  label: "Marketing Hub",
  urlPattern: "/marketing",
  intro: `<surface_intro>
You are on the Marketing hub: the portfolio entry point where an agency-scale operator scans every brand (client company) and managed website they run, checks how the workspace is connected and what it costs, and decides where to go next. No single brand or site is in focus here — everything you see is an aggregate over the portfolio the user can access.
Read hub_view first: it tells you which hub view is open (map, brands, sites, connections, cost) and therefore which values are populated. hub_pillars is the feature's own map — use it to route the user to the right surface by name and href instead of guessing URLs.
Counts and rows reflect what is currently loaded in the UI under the active search, filters, sort, and page (see list_query) — they are a view, never the complete database. brand_count / sites_total are the true filtered totals; site_count is the unfiltered managed-site total; visible_brands / visible_sites are bounded samples. All values populate only after the view loads: treat an empty value as "not loaded yet", never as "the portfolio is empty".
connection_status carries per-provider loading and unavailable flags — an unavailable inventory means the check failed, not that the account is disconnected. Never invent brands, sites, counts, connections, or costs that are not in the supplied values, and never act on a specific brand or site from here — the deeper brand, site, and page surfaces carry that context.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "portfolio_analyst",
      label: "Portfolio analyst",
      description:
        "Compares brands and sites across the portfolio to surface which client needs attention next (open findings, pending reviews, stale crawls).",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "onboarding_guide",
      label: "Onboarding guide",
      description:
        "Walks the user through adding a new brand or site and getting it initialized and connected (crawl, GSC, GA4, PageSpeed).",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "cost_analyst",
      label: "Cost analyst",
      description:
        "Explains where workspace runtime cost and provider spend are going, by site or client organization, from the loaded rollups.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * The hub routes carry no params, so no key is required.
 */
export function createMarketingScope(values: {
  // alwaysAvailable: false → optional
  hub_view?: string;
  hub_pillars?: ReadonlyArray<Record<string, unknown>>;
  brand_count?: number;
  visible_brands?: ReadonlyArray<Record<string, unknown>>;
  portfolio_summary?: ReadonlyArray<Record<string, unknown>>;
  site_count?: number;
  sites_total?: number;
  visible_sites?: ReadonlyArray<Record<string, unknown>>;
  site_editor?: Record<string, unknown>;
  connection_status?: Record<string, unknown>;
  cost_view?: string;
  list_query?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
