/**
 * Surface manifest — Content Plan Sites (`matrx-user/content-plan-list`).
 *
 * The feature's front door at `/marketing/content-plan`: one row per
 * RLS-visible site with its plan aggregates (pages planned, status mix,
 * keyword coverage, last activity). NO site is selected here — this is a
 * genuinely different page from the per-site workspace, so it does NOT
 * inherit `matrx-user/content-plan` (whose site-derived vocabulary would be
 * a lie on a list). An agent here reasons across the PORTFOLIO: which sites
 * have no plan, which are stalled, where keyword coverage is thin.
 *
 * Runtime emitter: `PlanSitesList.tsx` mounts a `SurfaceRuntimeProvider`.
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
    key: "plan_portfolio",
    label: "Plan portfolio",
    sortOrder: 100,
    description: "Every visible site with its plan aggregates.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "site_rows",
    label: "Site rows",
    description:
      "One record per RLS-visible site: id, domain, name, has_brand, plan vertical, planned-page count, keyword coverage, status mix, and last plan activity. Empty while sites or aggregates load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 100,
    group: "plan_portfolio",
  },
  {
    name: "site_total",
    label: "Site total",
    description:
      "Count of sites in the list. Empty while the site list loads.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 110,
    group: "plan_portfolio",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "open_site",
    label: "Open site plan",
    description:
      "Navigates to the given site's plan workspace (value = site UUID from site_rows). Pure navigation — nothing is written.",
    valueType: "string",
    mode: "ui",
    group: "plan_portfolio",
    sortOrder: 100,
  },
];

export const contentPlanListManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-plan-list",
  label: "Content Plan Sites",
  readiness: "partial",
  readinessNote:
    "Emitter wired in PlanSitesList; CMS-link column state not yet declared.",
  urlPattern: "/marketing/content-plan",
  intro: `<surface_intro>
You are on the Content Plan front door: every website the user can see, each with its plan's aggregates — pages planned, status mix, keyword coverage, last activity. No single site is selected here.
Read site_rows and reason across the portfolio: sites with zero planned pages need Setup; sites with thin keyword coverage or stalled statuses need attention. To act on ONE site's plan, tell the user to open it (or use the open_site write target) — the per-site surfaces carry the real plan data.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** Type-safe payload helper — nothing is guaranteed while queries hydrate. */
export function createContentPlanListScope(values: {
  site_rows?: Array<Record<string, unknown>>;
  site_total?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
