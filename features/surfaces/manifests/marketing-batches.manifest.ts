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
 * Runtime emitter: features/marketing/lib/scopes/batches-scope.ts
 * (being built in parallel).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity (300-349) ────────────────────────────────────────────────
  {
    name: "batch_id",
    label: "Batch job ID",
    description:
      "UUID of the `web.batch_job` the user has open. Set only on the detail route (/marketing/batches/[batchId]); empty on the batch list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },

  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "batch_summary",
    label: "Batch summary",
    description:
      "Summary of the open batch job: status, kind (llm/vision), provider, owning site, created/submitted/completed timestamps, external reference, item status counts, and error text if it failed. Empty on the list route or during initial load of the detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 400,
  },
  {
    name: "recent_batches",
    label: "Recent batches",
    description:
      "The batch job rows currently loaded in the list (respecting search, filters, sort, and pagination): id, site, status, kind, provider, timestamps, and error per job. Empty during initial load. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 410,
  },
];

export const marketingBatchesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-batches",
  label: "Marketing Batch Operations",
  urlPattern: "/marketing/batches",
  intro: `<surface_intro>
You are on the Marketing batch operations monitor: cross-site vision/LLM batch jobs that execute analysis work in bulk, and — on the detail route — one job's execution items with their analysis item, subject (site/page/snapshot), status, and cost attribution. This surface spans every site the user can access, so no single brand or site is in context here.
Batch state is execution evidence written by the system: jobs and items are monitor-only records, and the user has no edit path here by design. Your job is interpretation — explain what a job did, why it failed (error text, per-item failures), how long it took, what it cost — and to spot patterns across recent jobs (a provider failing repeatedly, one site consuming the queue).
batch_id is set only when a specific job is open; batch_summary and recent_batches populate after loading. Never invent job outcomes, statuses, or costs that are not in the supplied values, and never present a queued or processing job as finished.
</surface_intro>`,
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
  batch_summary?: Record<string, unknown>;
  recent_batches?: ReadonlyArray<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
