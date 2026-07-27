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
 * Runtime emitter: `SiteAnalysisTable` mounts the nested
 * `SurfaceRuntimeProvider` and spreads `useMarketingSiteSurfaceBase()`'s base
 * values into `createMarketingAnalysisScope` at trigger time.
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
    key: "priority_queue",
    label: "Priority queue",
    sortOrder: 100,
    description:
      "The ranked open findings the queue is showing, and the aggregate shape of what matches.",
  },
  {
    key: "queue_view",
    label: "Queue view",
    sortOrder: 200,
    description:
      "How the user is slicing the queue right now: search, filters, sort, and pagination.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Priority queue ────────────────────────────────────────────────────
  {
    name: "top_queue_items",
    label: "Top priority items",
    description:
      "The currently loaded priority-queue rows (analysis item key, category, subcategory, severity, priority score, affected page path/URL) respecting the table's search, filters, sort, and pagination. Empty during initial load or when no analysis providers have run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 300,
    group: "priority_queue",
  },
  {
    name: "queue_total",
    label: "Queue total",
    description:
      "Total number of open, non-suppressed prioritized items matching the current filters (not just the visible page). Zero when analysis has found nothing (or has not run); empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "priority_queue",
  },
  {
    name: "queue_rows_loaded",
    label: "Loaded rows",
    description:
      "How many queue rows the current table page actually holds — the size of top_queue_items. Empty during initial load; zero when nothing matches.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "priority_queue",
  },
  {
    name: "queue_severity_counts",
    label: "Severity breakdown",
    description:
      "Count of loaded queue rows per severity (e.g. { critical: 2, warning: 9 }) — a shape read of the visible page, not of the whole register. Empty when no rows are loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 330,
    group: "priority_queue",
  },
  {
    name: "queue_category_counts",
    label: "Category breakdown",
    description:
      "Count of loaded queue rows per analysis category (e.g. { metadata: 6, links: 3 }) — the visible page only. Empty when no rows are loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 340,
    group: "priority_queue",
  },
  {
    name: "queue_summary",
    label: "Queue summary",
    description:
      "Composite roll-up of the queue as displayed: { total_matching, rows_loaded, by_severity, by_category }. Mirrors the individual queue values as one object (completeness law). Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 350,
    group: "priority_queue",
  },

  // ── Queue view ────────────────────────────────────────────────────────
  {
    name: "active_filters",
    label: "Active queue filters",
    description:
      "The queue's current search and per-column filter state (free text, severity, item, category, subcategory, priority range) as the URL carries it. Empty when the user is on the unfiltered default view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    autoContext: false,
    sortOrder: 400,
    group: "queue_view",
  },
  {
    name: "queue_sort",
    label: "Active sort",
    description:
      'The column and direction the queue is sorted by, as "<column> <asc|desc>" (default "priority desc"). Empty during initial load.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    autoContext: false,
    sortOrder: 410,
    group: "queue_view",
  },
  {
    name: "queue_pagination",
    label: "Pagination",
    description:
      "Which slice of the queue is on screen: { page, page_size }. Empty during initial load. Read it before claiming the user has seen an item — everything outside this page is unseen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    autoContext: false,
    sortOrder: 420,
    group: "queue_view",
  },
  {
    name: "queue_view_state",
    label: "Queue view state",
    description:
      "Composite of the whole table view: { search, any_of, filters, sort, page, page_size }. Mirrors the individual queue-view values as one object (completeness law). Empty during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    autoContext: false,
    sortOrder: 430,
    group: "queue_view",
  },
];

export const marketingAnalysisManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-analysis",
  readiness: "verified",
  label: "Marketing Analysis Queue",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/analysis",
  inheritsFrom: "matrx-user/marketing-site",
  groups,
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
  queue_rows_loaded?: number;
  queue_severity_counts?: Record<string, number>;
  queue_category_counts?: Record<string, number>;
  queue_summary?: Record<string, unknown>;
  active_filters?: Record<string, unknown>;
  queue_sort?: string;
  queue_pagination?: Record<string, unknown>;
  queue_view_state?: Record<string, unknown>;
  // baseline
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
