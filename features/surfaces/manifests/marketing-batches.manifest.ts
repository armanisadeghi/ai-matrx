/**
 * Surface manifest — Marketing batch operations
 * (`matrx-user/marketing-batches`).
 *
 * Drives `/marketing/batches` and `/marketing/batches/[batchId]` — the
 * cross-site batch monitor of the Marketing system (`features/marketing`,
 * `BatchesTable` / `BatchDetailWorkspace`): vision/LLM batch jobs
 * (`web.batch_job`) across every site the user can access, and one job's
 * execution items (`web.batch_item` — analysis item, subject, status, cost).
 * Deliberately outside the brand/site tree — batches span sites, so no
 * brand or site context is inherited or guaranteed here.
 *
 * CROSS-SITE by design: `/marketing/batches` sits outside the
 * brand/site tree, so this manifest declares NO `inheritsFrom` and the route
 * guarantees NO brand or site identity — not even on the detail route, where
 * the owning site arrives as evidence on the job row (`batch_site_id`) rather
 * than as route-carried identity. Nothing here is `alwaysAvailable`: one
 * manifest covers both the list and the detail route, and neither route's
 * values exist on the other.
 *
 * Runtime emitters: `BatchesTable` (list) and `BatchDetailWorkspace` (detail)
 * each mount their own SurfaceRuntimeProvider.
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
    key: "batch_identity",
    label: "Batch identity",
    sortOrder: 100,
    description:
      "Which batch job is open, if any, and which site owns it. Detail route only.",
  },
  {
    key: "batch_execution",
    label: "Batch execution",
    sortOrder: 200,
    description:
      "What the open job did: its status record and its per-item execution units. Detail route only.",
  },
  {
    key: "batch_fleet",
    label: "Batch fleet",
    sortOrder: 300,
    description:
      "The cross-site job list as the user has it filtered on the list route.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Batch identity ────────────────────────────────────────────────────
  {
    name: "batch_id",
    label: "Batch job ID",
    description:
      "UUID of the `web.batch_job` the user has open. Set only on the detail route (/marketing/batches/[batchId]); empty on the batch list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "batch_identity",
  },
  {
    name: "batch_site_id",
    label: "Owning site ID",
    description:
      "UUID of the `web.site` the open job ran against — evidence read off the job row, NOT route-carried identity (this surface spans sites). Empty on the list route and while the detail route loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "batch_identity",
  },

  // ── Batch execution ───────────────────────────────────────────────────
  {
    name: "batch_summary",
    label: "Batch summary",
    description:
      "Summary of the open batch job: status, kind (llm/vision), provider, owning site domain, created/submitted/completed timestamps, external reference, total item count, and error text if it failed. Empty on the list route or during initial load of the detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 400,
    group: "batch_execution",
  },
  {
    name: "batch_items",
    label: "Batch items",
    description:
      "The execution units loaded for the open job (respecting the item table's search, filters, sort, and page; capped at 30): analysis item label and catalog key, status, subject_type + subject_id, provider, cost, result id, external reference, created timestamp, and error. Empty on the list route or when the job has no items loaded. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 410,
    group: "batch_execution",
  },
  {
    name: "batch_item_total",
    label: "Batch item total",
    description:
      "Total number of execution units matching the item table's current filters for the open job — the server count, not the loaded page length. Empty on the list route or during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "batch_execution",
  },

  // ── Batch fleet ───────────────────────────────────────────────────────
  {
    name: "recent_batches",
    label: "Recent batches",
    description:
      "The batch job rows currently loaded in the list (respecting search, filters, sort, and pagination; capped at 20): id, site, status, kind, provider, timestamps, and error per job. Empty on the detail route and during initial load. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 500,
    group: "batch_fleet",
  },
  {
    name: "batch_total",
    label: "Accessible job total",
    description:
      "Total number of batch jobs matching the list's current search and filters across every site the user can access — the server count, not the loaded page length. Empty on the detail route or during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 510,
    group: "batch_fleet",
  },
  {
    name: "list_query",
    label: "List query state",
    description:
      "How the user has the list narrowed right now: search text, active column filters, sort column + direction, page, and page size. Present on the list route (defaults: sort created_at desc, page size 50); empty on the detail route. Explains why recent_batches and batch_total are what they are.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 520,
    group: "batch_fleet",
  },
];

export const marketingBatchesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-batches",
  readiness: "verified",
  label: "Marketing Batch Operations",
  urlPattern: "/marketing/batches",
  intro: `<surface_intro>
You are on the Marketing batch operations monitor: cross-site vision/LLM batch jobs that execute analysis work in bulk, and — on the detail route — one job's execution items with their analysis item, subject (site/page/snapshot), status, and cost attribution. This surface spans every site the user can access, so no single brand or site is in context here.
Batch state is execution evidence written by the system: jobs and items are monitor-only records, and the user has no edit path here by design. Your job is interpretation — explain what a job did, why it failed (error text, per-item failures), how long it took, what it cost — and to spot patterns across recent jobs (a provider failing repeatedly, one site consuming the queue).
Read batch_id first — it tells you which of the two routes you are on. When it is set you are on ONE job: batch_summary, batch_items, batch_item_total, and batch_site_id describe it, and batch_site_id is evidence off the job row, not a site the route guarantees. When batch_id is empty you are on the fleet list: recent_batches holds the loaded page, batch_total is the true server count across every accessible site, and list_query explains the narrowing that produced both — never read the loaded rows as the whole fleet.
Never invent job outcomes, statuses, or costs that are not in the supplied values, and never present a queued or processing job as finished.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "operations_monitor",
      label: "Operations monitor",
      description:
        "Summarizes batch throughput and status across sites and flags stuck, slow, or unusually expensive jobs.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "failure_investigator",
      label: "Failure investigator",
      description:
        "Diagnoses failed batch jobs and items from their error text and execution records, and recommends remediation or retry.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * The surface covers both the list and detail routes, so no key is
 * required — `batch_id` is only present on the detail route.
 */
export function createMarketingBatchesScope(values: {
  // alwaysAvailable: false → optional
  batch_id?: string;
  batch_site_id?: string;
  batch_summary?: Record<string, unknown>;
  batch_items?: ReadonlyArray<Record<string, unknown>>;
  batch_item_total?: number;
  recent_batches?: ReadonlyArray<Record<string, unknown>>;
  batch_total?: number;
  list_query?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
