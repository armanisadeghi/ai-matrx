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
 * — draft feedback text, classify routing metadata, suggest which items are
 * stale, summarize what's pending.
 *
 * Emitter: WIRED. `AgentReviewClient.tsx` mounts `<SurfaceRuntimeProvider>`
 * and builds the scope from its live `rows` / `feedbackDrafts` /
 * `showArchived` state at Run time.
 *
 * AGENT-WRITABLE (read/write v1, 2026-08-11). Two targets, both `ask`, both
 * addressing ONE row by `row_id` from `queue_sample` — this surface has no
 * "selected row", so a write that does not name a live row is refused:
 *   - `review_feedback_draft` (draft) — stages prose into that row's feedback
 *     textarea, the same buffer the admin types into. Nothing is saved; the
 *     admin still presses Save feedback / Request changes / Approve. Read
 *     twin: `feedback_drafts`.
 *   - `review_triage_classification` (entity) — patches the four ROUTING
 *     fields inside `metadata.triage` through the page's own
 *     `metadataWithReviewTriage` merge, so the VERSIONED metadata envelope is
 *     patched, never replaced. Read twin: `queue_sample[].triage`.
 * Handlers live in `AgentReviewWriteTargets.tsx` and go through the page's
 * canonical `updateReviewQueueRow` service — never raw supabase. Because RLS
 * makes a non-super-admin UPDATE a silent zero-row no-op rather than an
 * error, the entity handler RE-READS the queue and throws when the value did
 * not actually land.
 *
 * DELIBERATELY NOT WRITABLE — and this list is the point of the surface:
 *   - STATUS transitions (Approve / Request changes / Archive / Restore).
 *     This queue holds work AGENTS produced. An agent approving or archiving
 *     its own review row is self-dealing, and that boundary is ABSOLUTE — not
 *     an `ask` dialog, not a policy override, simply undeclared. Every status
 *     change stays Arman's explicit button press.
 *   - `id`, `created_at`, `source` — identity and provenance.
 *   - `url` — the pointer to the artifact under review; changing it would
 *     re-aim a review at something the reviewer never saw.
 *   - `show_archived` — a mechanical view filter nobody needs an agent for.
 *   - `metadata.triage.assignment` and `.verification` — claim coordination
 *     owned by the `agent-review-queue` skill's atomic SQL claim protocol;
 *     a page write here would stomp another agent's live claim. The triage
 *     target preserves both sub-objects verbatim.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  REVIEW_LANES,
  REVIEW_PRIORITIES,
  REVIEW_TOOLS,
  REVIEW_WORKSTREAMS,
  type ReviewTriage,
} from "@/features/admin/agent-review/triage";
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
    name: "feedback_drafts",
    label: "Unsaved feedback drafts",
    description:
      "Feedback text currently staged in the UI but NOT yet saved, keyed by review-row id — the live contents of each row's feedback textarea wherever it differs from the row's saved `feedback`. Empty object when every row's editor matches what is stored. This is the read twin of the `review_feedback_draft` write target: read it back to confirm what is staged and awaiting the admin's Save feedback press.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 158,
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

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "review_feedback_draft",
    label: "Review feedback draft",
    description:
      "Stages review feedback into ONE row's feedback textarea — the same buffer the admin types into. Object value: { row_id: string, feedback: string }. `row_id` must be the id of a row present in queue_sample; a missing or unknown id is refused, because this page has no selected row. `feedback` is plain prose (newlines fine) and REPLACES the whole textarea, so include anything already in feedback_drafts / the row's saved feedback that should survive; an empty string clears the editor. Nothing is written to the database: the admin reads the staged text and decides whether to press Save feedback, Request changes, or Approve. Archived rows have no editor and are refused.",
    valueType: "object",
    updatesValue: "feedback_drafts",
    mode: "draft",
    applyPolicy: "ask",
    group: "queue",
    sortOrder: 100,
  },
  {
    name: "review_triage_classification",
    label: "Review triage classification",
    description:
      `Re-classifies how ONE row is ROUTED, saved immediately through the page's canonical update. Object value: { row_id: string, lane?, priority?, workstreams?, required_tools? } — row_id must appear in queue_sample, plus at least one of the four routing fields; anything else is refused. lane is one of: ${REVIEW_LANES.join(" | ")}. priority is one of: ${REVIEW_PRIORITIES.join(" | ")}. required_tools is a non-empty array (the FULL set, replacing the old one) of: ${REVIEW_TOOLS.join(" | ")}. workstreams is an array (also the FULL set, may be empty) of: ${REVIEW_WORKSTREAMS.join(" | ")}. Omitted fields keep their current values, and the row's assignment/claim state and verification record are preserved untouched. Only the triage block inside the versioned metadata envelope is patched — the rest of metadata is carried over as-is. A row with missing or invalid triage is classified from the page's own deterministic suggestion, with your fields applied on top. This does NOT change the row's status: approving, requesting changes, and archiving remain the admin's own button presses.`,
    valueType: "object",
    updatesValue: "queue_sample",
    mode: "entity",
    applyPolicy: "ask",
    group: "queue",
    sortOrder: 110,
  },
];

export const adminAgentReviewManifest: SurfaceManifest = {
  surfaceName: ADMIN_AGENT_REVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired in AgentReviewClient.tsx (counts + a row sample); code-audited complete 2026-08-09. Still needs the browser verification pass (load /administration/users/agent-review, open the Agents chrome, confirm the live scope) — the 2026-08-09 remote session couldn't reach production (network policy blocked aimatrx.com), so this stays partial per the readiness rules until someone runs it from an environment with production access.",
  label: "Agent Review Queue",
  urlPattern: "/administration/users/agent-review",
  intro: `<surface_intro>
This is an ADMIN surface: Arman's Agent Review Queue at /administration/users/agent-review, backed directly by agent.review_queue. Any agent that builds a reviewable demo, route, or UI surface inserts a row here for him to check.

Rows are grouped by status: pending (needs a first look), changes_requested (repair backlog), approved (signed off), and archived (fully handled). Structured metadata routes repair work by primary lane, required tools, priority, ownership, and verification state. repair_lane_counts and repair_tool_counts summarize that routing; tool counts deliberately overlap because real tasks often need more than one capability. queue_sample includes each row's triage envelope for detail.

What you may safely do: help Arman triage — summarize what's pending, draft feedback text for a row, classify how a row should be routed, flag stale items. Two write targets let you act on ONE row at a time, named by its row_id from queue_sample: review_feedback_draft stages prose into that row's feedback editor for him to read and save, and review_triage_classification saves a routing re-classification (lane, priority, workstreams, required tools).

What you never do: change a row's STATUS. This queue is where agents register their own work, so approving or archiving a row is not yours to do at any confidence level — Save feedback, Request changes, Approve, Archive, and Restore are all Arman's explicit button presses, and no write target exists for them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
  feedback_drafts: Record<string, string>;
  queue_sample: AdminAgentReviewSampleEntry[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  queue_load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
