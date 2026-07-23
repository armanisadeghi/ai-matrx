/**
 * Surface manifest — Marketing analysis queue (`matrx-user/marketing-analysis`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/analysis` — the
 * prioritized analysis triage table of the Marketing system
 * (`features/marketing`, `SiteAnalysisTable`). It pages through
 * `web.v_priority_queue`: open, non-suppressed finding projections ranked by
 * weight × severity × confidence, each carrying the analysis item, category /
 * subcategory, severity, and affected page. Rows deep-link into the findings
 * register (the view deliberately has no finding id). Inherits the brand +
 * site context backbone from `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/marketing-analysis-scope.ts —
 * being built in parallel.
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
    name: "top_queue_items",
    label: "Top priority items",
    description:
      "The currently loaded priority-queue rows (analysis item key, category, subcategory, severity, priority score, affected page path/URL) respecting the table's search, filters, sort, and pagination. Empty during initial load or when no analysis providers have run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 400,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "queue_total",
    label: "Queue total",
    description:
      "Total number of open, non-suppressed prioritized items matching the current filters. Zero when analysis has found nothing (or has not run); empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
  },
];

export const marketingAnalysisManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-analysis",
  label: "Marketing Analysis Queue",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/analysis",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the analysis priority queue of a managed website: open, non-suppressed findings ranked by weight × severity × confidence, each row naming the analysis item, its category, severity, and the affected page. Read the inherited brand_context and site_context first for the client and site framing; top_queue_items carries the loaded rows when bound.
The user comes here to triage: decide which detected problems deserve attention first and route them into the findings register for lifecycle work. Priority scores and severities are computed by the analysis pipeline and stored — trust them as given rather than re-scoring items yourself.
Queue rows are projections of findings, not findings themselves — a row has no finding id and site-level items have no page. When recommending next steps, point at the item/page combination (which filters the findings register), never invent a finding id or a result.
Suppressed and resolved findings are deliberately absent here; an empty queue means analysis found nothing open, not that the site is perfect in every dimension.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "priority_triager",
      label: "Priority triager",
      description:
        "Reads the ranked queue and advises which items to tackle first, grouping related items and flagging quick wins versus deep work.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "remediation_planner",
      label: "Remediation planner",
      description:
        "Turns the prioritized items into a concrete, ordered remediation plan across the affected pages.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the ones
 * inherited from marketing-site (site_id) and marketing-brand (brand_id).
 */
export function createMarketingAnalysisScope(values: {
  // alwaysAvailable: true (inherited) → required
  brand_id: string;
  site_id: string;
  // inherited optional context
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // surface-specific optional
  top_queue_items?: Array<Record<string, unknown>>;
  queue_total?: number;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
