/**
 * Surface manifest — Marketing hub (`matrx-user/marketing`).
 *
 * Drives `/marketing` — the portfolio triage entry point of the Marketing
 * system (`features/marketing`, `BrandsPortfolio` / `SitesPortfolio`). The
 * user scans every managed brand and site they can access (identity, status,
 * connection chips, pending-review and asset/fact counts) and decides which
 * client needs attention next. No single brand or site is in focus here —
 * the route carries no params, so nothing is guaranteed and every value is
 * an aggregate over the loaded portfolio.
 *
 * Runtime emitter: features/marketing/lib/scopes/marketing-scope.ts
 * (being built in parallel).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "brand_count",
    label: "Brand count",
    description:
      "Number of brands visible in the portfolio to this user. Populated once the portfolio has loaded; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
  },
  {
    name: "site_count",
    label: "Site count",
    description:
      "Number of managed websites visible to this user across all brands. Populated once the portfolio has loaded; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 610,
  },
  {
    name: "portfolio_summary",
    label: "Portfolio summary",
    description:
      "One row per loaded brand: brand identity, its sites, open findings, and pending discovery-review counts — the triage picture of which client needs attention. Reflects the currently loaded portfolio page (search/filters applied). Empty during initial load. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 620,
  },
];

export const marketingManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing",
  label: "Marketing Hub",
  urlPattern: "/marketing",
  intro: `<surface_intro>
You are on the Marketing hub: the portfolio entry point where an agency-scale operator scans every brand (client company) and managed website they run, and decides which one needs attention next. No single brand or site is in focus here — everything you see is an aggregate over the portfolio the user can access.
The counts (brand_count, site_count) and the portfolio_summary rows reflect what is currently loaded in the UI, including any active search or filters — they are a view, not the complete database. All values populate only after the workspace loads; treat empty values as "not loaded yet", never as "the portfolio is empty".
Your job on this surface is triage and orientation: help the user compare clients, spot the brand with the most open findings or pending reviews, and route them to the right brand or site workspace. Never invent brands, sites, or counts that are not in the supplied values, and never act on a specific brand or site from here — deeper surfaces carry that context.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * The hub route carries no params, so no key is required.
 */
export function createMarketingScope(values: {
  // alwaysAvailable: false → optional
  brand_count?: number;
  site_count?: number;
  portfolio_summary?: ReadonlyArray<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
