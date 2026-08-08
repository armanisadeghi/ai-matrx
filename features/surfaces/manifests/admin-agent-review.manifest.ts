/**
 * Surface manifest — Agent Review Queue (`matrx-admin/agent-review`).
 *
 * ADMIN SURFACE, NEW (no `ui_surface` row yet — must be seeded before sync).
 * Drives `/administration/users/agent-review`
 * (`app/(admin)/administration/users/agent-review/page.tsx` →
 * `features/admin/agent-review/components/AgentReviewClient.tsx`) — Arman's
 * queue of everything agents built that needs a human look, backed directly
 * by `agent.review_queue` (read/written via supabase-js, no server route).
 * See `features/admin/agent-review/FEATURE.md`.
 *
 * The repair board groups rows by status and exposes structured triage from
 * metadata: a primary lane, required tools, workstreams, priority, claim
 * state, and verification requirements. The table remains deliberately small;
 * routing and coordination evolve inside the versioned metadata envelope.
 *
 * What an agent bound here may safely do: read the queue (counts, and a
 * sample of rows with their instructions/feedback) and help the admin triage
 * — draft feedback text, suggest which items are stale, summarize what's
 * pending. It must NOT assume a status change or feedback save has happened;
 * those are the admin's explicit button presses (Save feedback / Request
 * changes / Approve / Archive / Restore), each a direct Supabase update the
 * page issues itself.
 *
 * Emitter: WIRED. `AgentReviewClient.tsx` mounts `<SurfaceRuntimeProvider>`
 * and builds the scope from its live `rows` / `grouped` / `showArchived`
 * state at Run time.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import type { ReviewTriage } from "@/features/admin/agent-review/triage";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_AGENT_REVIEW_SURFACE_NAME = "matrx-admin/agent-review";

const groups: SurfaceValueGroup[] = [
  {
    key: "queue",
    label: "Review queue",
    sortOrder: 100,
    description:
      "Counts of items in each review status, whether the archived section is expanded, and a sample of loaded rows.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "queue_row_count",
    label: "Total queue rows",
    description:
      "Number of rows currently loaded from `agent.review_queue` (up to the 500-row fetch limit), across all statuses. Zero while the initial load is in flight or if the queue is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 100,
    group: "queue",
  },
  {
    name: "pending_count",
    label: "Pending count",
    description:
      'Number of loaded rows with status "pending" — items waiting on the admin\'s first look. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 110,
    group: "queue",
  },
  {
    name: "changes_requested_count",
    label: "Changes-requested count",
    description:
      'Number of loaded rows with status "changes_requested" — items where the admin left feedback and is waiting on the originating agent. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 120,
    group: "queue",
  },
  {
    name: "approved_count",
    label: "Approved count",
    description:
      'Number of loaded rows with status "approved" — items the admin signed off on but that are not yet archived. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 130,
    group: "queue",
  },
  {
    name: "archived_count",
    label: "Archived count",
    description:
      'Number of loaded rows with status "archived" — fully handled items, collapsed by default. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 140,
    group: "queue",
  },
  {
    name: "show_archived",
    label: "Archived section expanded",
    description:
      "True when the admin has expanded the collapsed archived section in the UI. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 150,
    group: "queue",
  },
  {
    name: "unclassified_count",
    label: "Unclassified count",
    description:
      "Number of loaded rows whose metadata.triage envelope is missing or invalid. These rows cannot be routed safely until classified.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 155,
    group: "queue",
  },
  {
    name: "repair_lane_counts",
    label: "Repair counts by lane",
    description:
      "Changes-requested row counts keyed by primary lane: browser_ui, code_only, database_data, backend_api, deployment, cross_system, and human_required.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 180,
    sortOrder: 156,
    group: "queue",
  },
  {
    name: "repair_tool_counts",
    label: "Repair counts by required tool",
    description:
      "Changes-requested row counts keyed by required tool. Counts overlap because one repair may require browser, code, database, deployment, or external-service access together.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    sortOrder: 157,
    group: "queue",
  },
  {
    name: "queue_load_error",
    label: "Queue load error",
    description:
      "The error message from the last failed `agent.review_queue` read. Absent when the load succeeded or hasn't run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 160,
    group: "queue",
  },
  {
    name: "queue_sample",
    label: "Queue sample",
    description:
      "The first several loaded rows, each with { id, title, url, status, source, instructions, feedback, created_at, triage }, newest first. Bindable, not auto-context — instructions/feedback text adds up fast. Empty array before the first successful load.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 170,
    group: "queue",
  },
];

export const adminAgentReviewManifest: SurfaceManifest = {
  surfaceName: ADMIN_AGENT_REVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired in AgentReviewClient.tsx (counts + a row sample), but not yet browser-verified end to end, so this stays partial rather than verified per the readiness rules.",
  label: "Agent Review Queue",
  urlPattern: "/administration/users/agent-review",
  intro: `<surface_intro>
This is an ADMIN surface: Arman's Agent Review Queue at /administration/users/agent-review, backed directly by agent.review_queue. Any agent that builds a reviewable demo, route, or UI surface inserts a row here for him to check.

Rows are grouped by status: pending (needs a first look), changes_requested (repair backlog), approved (signed off), and archived (fully handled). Structured metadata routes repair work by primary lane, required tools, priority, ownership, and verification state. repair_lane_counts and repair_tool_counts summarize that routing; tool counts deliberately overlap because real tasks often need more than one capability. queue_sample includes each row's triage envelope for detail.

What you may safely do: help Arman triage — summarize what's pending, draft feedback text for a row, flag stale items. You never change a row's status or save feedback yourself; every state transition (Save feedback / Request changes / Approve / Archive / Restore) is Arman's explicit button press.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One row as emitted in `queue_sample`. */
export interface AdminAgentReviewSampleEntry {
  id: string;
  title: string;
  url: string;
  status: "pending" | "changes_requested" | "approved" | "archived";
  source: string;
  instructions: string;
  feedback: string | null;
  created_at: string;
  triage: ReviewTriage | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminAgentReviewScope(values: {
  // alwaysAvailable: true → required
  queue_row_count: number;
  pending_count: number;
  changes_requested_count: number;
  approved_count: number;
  archived_count: number;
  unclassified_count: number;
  repair_lane_counts: Record<string, number>;
  repair_tool_counts: Record<string, number>;
  show_archived: boolean;
  queue_sample: AdminAgentReviewSampleEntry[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  queue_load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
