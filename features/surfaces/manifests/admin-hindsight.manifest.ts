/**
 * Surface manifest — Hindsight (`matrx-admin/hindsight`).
 *
 * Hindsight is the platform reading its own transcripts and proposing fixes to
 * itself. The admin console at `/administration/agents/hindsight` is where a
 * human works that loop: pick an enrolled subject, read what the reviewer
 * found, decide each finding, and — when a finding needs evidence rather than
 * an opinion — REPLAY a real recorded call and let the replay judge rank the
 * result against what actually happened.
 *
 * Why this surface exists at all: an agent bound here is reasoning ABOUT other
 * agents' behaviour. The values below are deliberately the review substrate —
 * the enrollment under inspection, the findings on the table, what can be
 * replayed, the spend — because that is the material such an agent weighs.
 * The subjects' own transcripts are NOT declared here: they are reached
 * through the example doors, and pulling whole conversations into this scope
 * would hand a meta-agent the very content the reviewer already condensed.
 *
 * Curated groups (band 0-899):
 *
 *   enrollment      Which subject is under review, and its cadence/lens
 *   review_state    The findings and reviews currently on screen
 *   replay_evidence Which recorded calls can be re-run as evidence
 *   spend           What Hindsight has cost on this enrollment
 *
 * Readiness is `partial` on purpose — see `readinessNote`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_HINDSIGHT_SURFACE_NAME = "matrx-admin/hindsight";

const groups: SurfaceValueGroup[] = [
  {
    key: "enrollment",
    label: "Enrolled subject",
    sortOrder: 100,
    description:
      "The thing under continuous review — what it is, how often it is read, and how wide a window each review takes.",
  },
  {
    key: "review_state",
    label: "Reviews & findings",
    sortOrder: 200,
    description:
      "What the reviewer has produced for this subject and what is still awaiting a human decision.",
  },
  {
    key: "replay_evidence",
    label: "Replay evidence",
    sortOrder: 300,
    description:
      "Which of this subject's recorded calls can be re-run right now as evidence for a finding.",
  },
  {
    key: "spend",
    label: "Spend",
    sortOrder: 400,
    description:
      "Money Hindsight has spent reviewing and replaying this subject. Never the subject's own historical cost.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "selected_enrollment_id",
    label: "Selected enrollment",
    description:
      "UUID of the enrollment whose detail panel is open. Empty when the operator has not picked one yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "enrollment",
    sortOrder: 100,
  },
  {
    name: "enrollment_subject_kind",
    label: "Subject kind",
    description:
      "What class of thing is enrolled: agent, orchestra, workflow, workflow_node, tool, or environment. Decides which doors and actions exist.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "enrollment",
    sortOrder: 200,
  },
  {
    name: "enrollment_display_name",
    label: "Subject name",
    description:
      "The human name of the enrolled subject as shown in the sidebar. Present whenever an enrollment is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "enrollment",
    sortOrder: 300,
  },
  {
    name: "enrollment_goal",
    label: "Improvement goal",
    description:
      "The operator's stated goal for this enrollment — what 'better' means here. Empty when none was set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "enrollment",
    sortOrder: 400,
  },
  {
    name: "enrollment_lens",
    label: "Review lens",
    description:
      "How much each review reads: window mode, window size, review cadence, and the per-review example cap. A verdict depends on this and it is invisible after enrollment.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 140,
    group: "enrollment",
    sortOrder: 500,
  },
  {
    name: "open_findings",
    label: "Open findings",
    description:
      "Findings awaiting a human decision on the selected enrollment — lever, title, and status for each. Empty array when everything is decided.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "review_state",
    sortOrder: 100,
  },
  {
    name: "review_summaries",
    label: "Recent reviews",
    description:
      "The selected enrollment's review history — id, status, example count, and cost per review. Not the review bodies.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "review_state",
    sortOrder: 200,
  },
  {
    name: "pending_example_count",
    label: "Examples waiting",
    description:
      "How many real runs the next review would read, including any the settle window still excludes.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "review_state",
    sortOrder: 300,
  },
  {
    name: "replayable_examples",
    label: "Replayable calls",
    description:
      "Recorded calls on this enrollment that can be re-run right now — kind and id for each. A wf_node_outcome is excluded because it is a step inside a run, not a re-issuable call.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    group: "replay_evidence",
    sortOrder: 200,
  },
  {
    name: "enrollment_spend",
    label: "Hindsight spend",
    description:
      "What Hindsight has spent on this enrollment: total, reviewing, replaying, and the counts behind each. Never the subject's own historical run cost.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "spend",
    sortOrder: 100,
  },
  {
    name: "platform_hindsight_spend",
    label: "Platform-wide spend",
    description:
      "Hindsight's total spend across every enrollment, as shown in the page toolbar. Always present on this surface.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 160,
    group: "spend",
    sortOrder: 200,
  },
];

export const adminHindsightManifest: SurfaceManifest = {
  surfaceName: ADMIN_HINDSIGHT_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + emitter are wired for the enrollment/review/spend values the page holds. NOT declared, deliberately: replay verdicts (they hang off ReviewDetailOut, fetched lazily per review — the enrollment payload does not carry them, so declaring them would promise what the emitter cannot deliver), and Internal Affairs' change-history / finding-effectiveness tables. No agent roles are bound yet.",
  label: "Hindsight",
  urlPattern: "/administration/agents/hindsight",
  intro: `<surface_intro>
You are on Hindsight, the platform's self-review console. An operator here is
working one enrolled subject at a time: an agent, orchestra, workflow, workflow
step, tool, or environment that the platform reads its own transcripts about.

The work is deciding. A reviewer agent has already read the subject's REAL runs
and proposed fixes across four levers — instructions, resources, tool design,
architecture — and each proposal sits as a finding waiting for a human to apply
or reject it. The operator's hard question is almost never "what changed?" but
"is this proposal actually supported?".

That is what the replay values are for. A replay re-runs one real recorded call
against a candidate change and a judge ranks the result against what actually
happened, so a finding can be backed by evidence instead of plausibility. A
verdict of "regressed" means the replay lost something the original did
correctly. Treat a finding with no replay behind it as an untested claim.

Read the spend values carefully: they are what Hindsight COST to review and
replay this subject, never what the subject's own historical runs cost. The two
are different numbers and conflating them makes the economics meaningless.

The subjects' transcripts are deliberately not in this scope. Each review names
the exact runs it read and every one of them opens through its own door.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/**
 * The scope this surface emits at trigger time.
 *
 * "A UI cannot lie": every `alwaysAvailable: true` value is required here and
 * every optional one is genuinely optional. Only the platform-wide spend strip
 * is guaranteed — everything else depends on an enrollment being selected, and
 * on this page it legitimately may not be.
 */
export function createAdminHindsightScope(values: {
  platform_hindsight_spend: Record<string, unknown>;
  selected_enrollment_id?: string;
  enrollment_subject_kind?: string;
  enrollment_display_name?: string;
  enrollment_goal?: string;
  enrollment_lens?: Record<string, unknown>;
  open_findings?: unknown[];
  review_summaries?: unknown[];
  pending_example_count?: number;
  replayable_examples?: unknown[];
  enrollment_spend?: Record<string, unknown>;
  selection?: string;
  context?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
