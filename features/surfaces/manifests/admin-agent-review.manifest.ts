/**
 * Surface manifest — Agent Review queue (`matrx-admin/agent-review`).
 *
 * ADMIN SURFACE. Drives the LIST route `/administration/users/agent-review`
 * (`app/(admin)/administration/users/agent-review/page.tsx` →
 * `features/admin/agent-review/components/AgentReviewQueueTable.tsx`) — the
 * board of everything agents built, backed directly by `agent.review_queue`
 * (read/written via supabase-js, no server route). The routed item workspace
 * at `/administration/users/agent-review/[id]` is its own surface,
 * `matrx-admin/agent-review-item`: the list can never emit the open row's
 * state and the item page can never emit true queue-wide counts, so one
 * surface would have to lie about `alwaysAvailable` on half its values.
 * See `features/admin/agent-review/FEATURE.md`.
 *
 * Classification is three registry-backed identities — repository
 * (`platform.repo`), domain and feature (`platform.taxonomy_node`) — never
 * free text. Repair ROUTING lives inside the versioned `metadata.triage`
 * envelope the `agent-review-queue` skill writes on insert, and the Codex
 * first-pass worker claims rows by it.
 *
 * Emitter: WIRED. `AgentReviewQueueTable.tsx` mounts `<SurfaceRuntimeProvider>`
 * around its context menu and builds the scope through
 * `buildAgentReviewScope` (`features/admin/agent-review/surface-scope.ts`)
 * from its live rows / registry / view state at trigger time.
 *
 * What an agent bound here may safely do: read the queue (true counts per
 * workflow status, repair routing rollups, the classification vocabulary, and
 * a sample of the rows on screen) and help the admin triage — summarize
 * what's waiting, flag stale items, classify how a row should be routed.
 *
 * AGENT-WRITABLE. ONE target, `ask`, addressing ONE row by `row_id` from
 * `queue_sample`; this surface has no "selected row", so a write that does
 * not name a live row is refused:
 *   - `review_triage_classification` (entity) — patches the four ROUTING
 *     fields inside `metadata.triage` through `metadataWithReviewTriage`, so
 *     the VERSIONED metadata envelope is patched, never replaced. Read twin:
 *     `queue_sample[].triage`. The handler lives in
 *     `AgentReviewWriteTargets.tsx` and goes through the page's canonical
 *     `updateReviewQueueRow` service — never raw supabase. Because RLS makes
 *     a non-super-admin UPDATE a silent zero-row no-op rather than an error,
 *     it RE-READS the row and throws when the value did not actually land.
 *
 * DELIBERATELY NOT WRITABLE — and this list is the point of the surface:
 *   - STATUS transitions (Request changes / Approve / Re-review / Archive).
 *     This queue holds work AGENTS produced. An agent moving its own review
 *     row forward is self-dealing, and that boundary is ABSOLUTE — not an
 *     `ask` dialog, not a policy override, simply undeclared. Every status
 *     change stays a human button press on the item workspace, where it is
 *     recorded as a message in the review's own conversation.
 *   - `id`, `created_at`, `source` — identity and provenance.
 *   - `url` — the pointer to the artifact under review; changing it would
 *     re-aim a review at something the reviewer never saw.
 *   - `domain_id`, `feature_id`, `repo_slug` — registry classification, set by
 *     the agent that filed the row and corrected by Arman.
 *   - `queue_view` — a mechanical view filter nobody needs an agent for.
 *   - `metadata.triage.assignment` and `.verification` — claim coordination
 *     owned by the `agent-review-queue` skill's atomic SQL claim protocol; a
 *     page write here would stomp another agent's live claim, and the
 *     verification record is the evidence gate for reaching a human. The
 *     triage target preserves both sub-objects verbatim.
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
import type { ReviewStatus } from "@/features/admin/agent-review/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_AGENT_REVIEW_SURFACE_NAME = "matrx-admin/agent-review";

const groups: SurfaceValueGroup[] = [
  {
    key: "queue",
    label: "Review queue",
    sortOrder: 100,
    description:
      "True counts of the whole queue by workflow status, which view is open, and a sample of the rows on screen.",
  },
  {
    key: "repair_routing",
    label: "Repair routing",
    sortOrder: 200,
    description:
      "How the changes-requested backlog is routed: primary lane, required tools, and how much of the queue is unclassified.",
  },
  {
    key: "classification",
    label: "Classification vocabulary",
    sortOrder: 300,
    description:
      "The registry identities every review row is classified by — repositories, domains, and the features under them.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "queue_row_count",
    label: "Total queue rows",
    description:
      "TRUE number of rows in `agent.review_queue` across every status — the list reads through `readAllRows`, so this is not a page count. Zero while the initial load is in flight or if the queue is empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 100,
    group: "queue",
  },
  {
    name: "queue_view",
    label: "Open view",
    description:
      '"inbox" when the list is showing only the rows waiting on Arman (status ready_for_human), "all" when it is showing every row in the workflow. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 105,
    group: "queue",
  },
  {
    name: "visible_row_count",
    label: "Rows on screen",
    description:
      "Number of rows the table is currently showing under the open view — the same set `queue_sample` is drawn from. Always present (0 when the view is empty).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 108,
    group: "queue",
  },
  {
    name: "submitted_count",
    label: "Submitted count",
    description:
      'Rows with status "submitted" — filed by an agent and waiting for an agent reviewer to pick them up. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 110,
    group: "queue",
  },
  {
    name: "agent_review_count",
    label: "Agent-review count",
    description:
      'Rows with status "agent_review" — an agent is reviewing them right now. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 115,
    group: "queue",
  },
  {
    name: "agent_changes_requested_count",
    label: "Agent-repair count",
    description:
      'Rows with status "agent_changes_requested" — an agent reviewer found problems and repair is routed through metadata.triage. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 120,
    group: "queue",
  },
  {
    name: "ready_for_human_count",
    label: "Ready-for-you count",
    description:
      'Rows with status "ready_for_human" — agent-reviewed, repaired and verified, and the ONLY status that reaches Arman. This is the inbox number. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 125,
    group: "queue",
  },
  {
    name: "human_changes_requested_count",
    label: "Your-changes-requested count",
    description:
      'Rows with status "human_changes_requested" — Arman looked and sent them back with feedback. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 130,
    group: "queue",
  },
  {
    name: "approved_count",
    label: "Approved count",
    description:
      'Rows with status "approved" — signed off but not yet archived. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 135,
    group: "queue",
  },
  {
    name: "archived_count",
    label: "Archived count",
    description:
      'Rows with status "archived" — fully handled, hidden from the inbox view. Always present (0 when none).',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 140,
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
      "The first 25 rows of the open view, each with { id, title, url, status, source, repo_slug, domain, feature, instructions, feedback, conversation_id, created_at, updated_at, triage }. Bindable, not auto-context — instructions and feedback are prose and add up fast. Empty array before the first successful load.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 170,
    group: "queue",
  },
  {
    name: "unclassified_count",
    label: "Unclassified count",
    description:
      "Rows across the whole queue whose `metadata.triage` envelope is missing or fails validation. These cannot be routed or claimed by the repair worker until they are classified. Always present (0 when none).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 200,
    group: "repair_routing",
  },
  {
    name: "repair_lane_counts",
    label: "Repair counts by lane",
    description:
      "Changes-requested rows (agent- and human-requested together) counted by primary lane: browser_ui, code_only, database_data, backend_api, deployment, cross_system, human_required. Every lane key is present, with 0 where nothing is routed there. Rows with no valid triage are excluded and counted in unclassified_count.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 180,
    sortOrder: 210,
    group: "repair_routing",
  },
  {
    name: "repair_tool_counts",
    label: "Repair counts by required tool",
    description:
      "The same changes-requested rows counted by required tool. Counts deliberately OVERLAP because one repair may need browser, code, database and deployment access together, so these do not sum to the row count. Every tool key is present, with 0 where nothing needs it.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    sortOrder: 220,
    group: "repair_routing",
  },
  {
    name: "classification_vocabulary",
    label: "Classification vocabulary",
    description:
      "The registry identities the queue classifies by: { domains: [{ id, slug, name, features: [{ id, slug, name }] }], repos: [slug] }, loaded from `platform.taxonomy_node` and `platform.repo`. This is the whole allowed vocabulary — classification is never free text. Bindable, not auto-context.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 300,
    group: "classification",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "review_triage_classification",
    label: "Review triage classification",
    description:
      `Re-classifies how ONE row is ROUTED, saved immediately through the page's canonical update. Object value: { row_id: string, lane?, priority?, workstreams?, required_tools? } — row_id must appear in queue_sample, plus at least one of the four routing fields; anything else is refused. lane is one of: ${REVIEW_LANES.join(" | ")}. priority is one of: ${REVIEW_PRIORITIES.join(" | ")}. required_tools is a non-empty array (the FULL set, replacing the old one) of: ${REVIEW_TOOLS.join(" | ")}. workstreams is an array (also the FULL set, may be empty) of: ${REVIEW_WORKSTREAMS.join(" | ")}. Omitted fields keep their current values, and the row's assignment/claim state and verification record are preserved untouched. Only the triage block inside the versioned metadata envelope is patched — the rest of metadata is carried over as-is. A row with missing or invalid triage is classified from the page's own deterministic suggestion, with your fields applied on top. This does NOT change the row's status: requesting changes, approving and archiving remain human button presses on the review's own page.`,
    valueType: "object",
    updatesValue: "queue_sample",
    mode: "entity",
    applyPolicy: "ask",
    group: "repair_routing",
    sortOrder: 200,
  },
];

export const adminAgentReviewManifest: SurfaceManifest = {
  surfaceName: ADMIN_AGENT_REVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter and the triage write target were rebuilt against the live agent-first list on 2026-08-26 (the manifest had drifted to the retired human-first page: pending/changes_requested statuses, an archived toggle, and per-row feedback drafts that no longer exist on this route). Still needs the live browser pass: load /administration/users/agent-review as a super-admin, open the Agents chrome, confirm the emitted scope, and run one triage write end to end.",
  label: "Agent Review Queue",
  urlPattern: "/administration/users/agent-review",
  intro: `<surface_intro>
This is an ADMIN surface: the Agent Review queue at /administration/users/agent-review, backed directly by agent.review_queue. Agent Review is an agent-first pipeline — agents submit, review, repair and verify each other's work, and only rows that reach ready_for_human ever ask a person to look.

Rows move submitted → agent_review → agent_changes_requested ↔ agent_review → ready_for_human → human_changes_requested ↔ agent_review → approved → archived, and every row owns one durable conversation where each round is a message. The counts here are true counts of the whole queue; queue_view says whether the person is looking at their inbox (ready_for_human only) or all activity, and queue_sample holds the rows currently on screen. Every row is classified by three registry identities — repository, domain, feature — drawn from classification_vocabulary, never free text.

repair_lane_counts and repair_tool_counts summarize how the changes-requested backlog is routed; tool counts overlap on purpose because real repairs often need more than one capability, and unclassified_count is the work no repair worker can claim yet.

What you may safely do: help triage — summarize what is waiting, flag stale items, and re-classify how one row should be routed with review_triage_classification, naming the row by its row_id from queue_sample.

What you never do: change a row's STATUS. This queue is where agents register their own work, so moving a row forward is not yours to do at any confidence level — Request changes, Approve, Run agent review again and Archive are all human button presses on the review's own page, and no write target exists for them.
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
  status: ReviewStatus;
  source: string;
  repo_slug: string;
  domain: string;
  feature: string;
  instructions: string;
  feedback: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  triage: ReviewTriage | null;
}

/** The registry vocabulary emitted in `classification_vocabulary`. */
export interface AdminAgentReviewVocabulary {
  domains: Array<{
    id: string;
    slug: string;
    name: string;
    features: Array<{ id: string; slug: string; name: string }>;
  }>;
  repos: string[];
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminAgentReviewScope(values: {
  // alwaysAvailable: true → required
  queue_row_count: number;
  queue_view: string;
  visible_row_count: number;
  submitted_count: number;
  agent_review_count: number;
  agent_changes_requested_count: number;
  ready_for_human_count: number;
  human_changes_requested_count: number;
  approved_count: number;
  archived_count: number;
  unclassified_count: number;
  repair_lane_counts: Record<string, number>;
  repair_tool_counts: Record<string, number>;
  classification_vocabulary: AdminAgentReviewVocabulary;
  queue_sample: AdminAgentReviewSampleEntry[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  queue_load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
