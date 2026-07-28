/**
 * Surface manifest — Marketing rank tracking hub (`matrx-user/marketing-ranks-hub`).
 *
 * Drives `/marketing/ranks` — the CROSS-SITE rank hub (`CrossSiteRanksHub`):
 * every rank target the caller can see, across every brand and site, in one
 * table. Read-only portfolio view: data comes from bounded direct Supabase
 * reads (`cross-site-data.ts`, seo.rank_target + seo.rank_observation +
 * web.site under the caller's JWT); adding targets and firing checks stays on
 * the per-site Ranks workspace (`matrx-user/marketing-ranks`), which every row
 * links to. Standalone — deliberately NOT inheriting marketing-site: no single
 * brand or site is in focus here.
 *
 * Runtime emitter: `CrossSiteRanksHub.tsx` mounts `<SurfaceRuntimeProvider>`
 * and assembles `createMarketingRanksHubScope(...)` from the live query state
 * at trigger time.
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
    key: "cross_site_portfolio",
    label: "Cross-site portfolio",
    sortOrder: 100,
    description:
      "Every tracked rank target across every brand and site the user can see, plus the rollup over them.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    group: "cross_site_portfolio",
    name: "portfolio_summary",
    label: "Portfolio summary",
    description:
      "Rollup over the loaded cross-site portfolio: { targets, sites, improved, declined } — improved/declined count ACTIVE targets whose latest position moved vs the previous observation. Always present; all counts are zero before the portfolio loads or when nothing is tracked anywhere.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 70,
    sortOrder: 300,
  },
  {
    group: "cross_site_portfolio",
    name: "rank_portfolio",
    label: "Cross-site tracked keywords",
    description:
      "Every loaded rank target across all brands and sites, one row each: keyword, site (id, name, domain, brand id), tracking mode (engine / device / search_type / user-facing label), active flag, derived latest position, previous position, movement, best position, last-checked timestamp, and the observation history inside the sparkline window (oldest first). Always an array — empty before the portfolio loads or when nothing is tracked. A row's site name/domain can be null when the target is readable but its site row is not.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 9000,
    autoContext: false,
    sortOrder: 310,
  },
  {
    group: "cross_site_portfolio",
    name: "history_window_days",
    label: "History window (days)",
    description:
      "The lookback window, in days, that bounds each row's observation history and therefore the movement math. Always present — a build-time constant of the hub, not loaded data.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 320,
  },
  {
    group: "cross_site_portfolio",
    name: "portfolio_load_error",
    label: "Portfolio load error",
    description:
      "The error message shown in place of the table when the cross-site portfolio fetch failed. Empty whenever the portfolio loaded normally — its presence means the portfolio values above are unreliable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 330,
  },
];

export const marketingRanksHubManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-ranks-hub",
  readiness: "partial",
  readinessNote:
    "Declared, emitted (CrossSiteRanksHub provider), routed, and synced; the live non-matching-name binding + Matrx-vs-matrix verification has not been run yet.",
  label: "Marketing Rank Tracking Hub",
  urlPattern: "/marketing/ranks",
  intro: `<surface_intro>
You are on the cross-site rank tracking hub: every keyword (and AI-answer prompt) tracked across EVERY brand and site the user can see, in one portfolio table. No single brand or site is in focus — this is the "where does the whole portfolio stand" view, and its job is triage: which sites moved, which declined, which targets are stale or never checked.
Positions are COLLECTED EVIDENCE, not opinion. A target that has never been checked has a null position — that means "unknown", never "not ranking". movement is the change since the previous observation (positive = improved) inside the history_window_days lookback, and best_position is the best observed inside that window. Never invent a position, a competitor, or a trend the values do not contain.
Each row declares HOW it is tracked (engine, device, search_type, and a user-facing tracking label) — a Google national position, a map-pack position, and a citation in a ChatGPT answer are different measurements; never compare them as one number. A row whose site name and domain are null is a target the user can read whose site row they cannot — say so rather than guessing the site.
This hub is read-only: adding keywords and running live checks happens on a site's own Ranks workspace, which every row links to. When the user wants fresh data or a new target, route them there (open the site under Brands, then Ranks) instead of promising an action this page cannot take.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "portfolio_rank_analyst",
      label: "Portfolio rank analyst",
      description:
        "Reads the cross-site portfolio to surface the biggest movers and losers across brands, separate real drops from unchecked or newly added targets, and say which site's Ranks workspace to open next.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Standalone surface (no inheritance): required keys ↔ the three
 * `alwaysAvailable: true` values above.
 */
export function createMarketingRanksHubScope(values: {
  // alwaysAvailable: true → required
  portfolio_summary: Record<string, unknown>;
  rank_portfolio: ReadonlyArray<Record<string, unknown>>;
  history_window_days: number;
  // surface-specific optionals
  portfolio_load_error?: string;
  // baseline optionals
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
