/**
 * Surface manifest — Agent Review item (`matrx-admin/agent-review-item`).
 *
 * ADMIN SURFACE. Drives the routed review workspace
 * `/administration/users/agent-review/[id]`
 * (`app/(admin)/administration/users/agent-review/[id]/page.tsx` →
 * `features/admin/agent-review/components/AgentReviewWorkspace.tsx`): one
 * `agent.review_queue` row, its stage rail, its durable conversation, and the
 * human's own feedback editor.
 *
 * It is a SEPARATE surface from the queue list (`matrx-admin/agent-review`),
 * not a child of it: the list cannot emit the open row's state and this page
 * cannot emit true queue-wide counts, so one shared surface would have to lie
 * about `alwaysAvailable` on half its values. Identity here is ROUTED — the
 * review id is in the URL — so every value below is genuinely guaranteed once
 * the row has loaded.
 *
 * Emitter: WIRED. `AgentReviewWorkspace.tsx` registers through
 * `useSurfaceRuntimeRegistration` (the page has early returns for loading and
 * error, so a wrapping provider would unregister on every branch flip) and
 * registers NOTHING until the row is loaded — an unregistered surface is
 * honest, a scope of empty strings is not.
 *
 * AGENT-WRITABLE. ONE target, `ask`:
 *   - `review_feedback_draft` (draft) — replaces the text in the review
 *     editor, the same buffer the human types into. Nothing is written to the
 *     database and no status moves: the human reads the staged text and
 *     decides whether to press Request changes, Approve, or Run agent review
 *     again. Read twin: `feedback_draft`.
 *
 * DELIBERATELY NOT WRITABLE: every STATUS transition. This row exists because
 * an agent produced something for a human to check; an agent moving it
 * forward is self-dealing, and that boundary is ABSOLUTE — not an `ask`
 * dialog, simply undeclared. Each transition also appends a message to the
 * review's conversation as the authenticated human, which no agent may author.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import type { ReviewTriage } from "@/features/admin/agent-review/triage";
import type { ReviewStatus } from "@/features/admin/agent-review/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME =
  "matrx-admin/agent-review-item";

const groups: SurfaceValueGroup[] = [
  {
    key: "review_identity",
    label: "Review identity",
    sortOrder: 100,
    description:
      "Which review is open, where it sits in the workflow, and the registry classification it was filed under.",
  },
  {
    key: "review_content",
    label: "Review content",
    sortOrder: 200,
    description:
      "What the reviewing agent was asked to check, the last recorded human feedback, and the routing envelope.",
  },
  {
    key: "review_editor",
    label: "Your review editor",
    sortOrder: 300,
    description:
      "The unsaved contents of the feedback editor on this page — what the human is about to send back.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "review_id",
    label: "Review id",
    description:
      "UUID of the `agent.review_queue` row this page is open on, taken from the route. Always present — the surface registers nothing until the row loads.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 100,
    group: "review_identity",
  },
  {
    name: "review_title",
    label: "Review title",
    description:
      "The one-line title the filing agent gave this review item. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 90,
    sortOrder: 110,
    group: "review_identity",
  },
  {
    name: "review_status",
    label: "Workflow status",
    description:
      "Where the row sits: submitted, agent_review, agent_changes_requested, ready_for_human, human_changes_requested, approved, or archived. Only ready_for_human is waiting on the human. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 120,
    group: "review_identity",
  },
  {
    name: "review_target_url",
    label: "Target page",
    description:
      "The fully qualified URL of the surface under review — the page the human opens to check the work. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 90,
    sortOrder: 130,
    group: "review_identity",
  },
  {
    name: "review_repo_slug",
    label: "Repository",
    description:
      "Registry repository slug (`platform.repo`) the reviewed work lives in — matrx-frontend, aidream, and so on. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 140,
    group: "review_identity",
  },
  {
    name: "review_domain",
    label: "Domain",
    description:
      'Registry domain name (`platform.taxonomy_node`) this review is classified under. "Not assigned" when the row points at a domain the registry no longer has. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    sortOrder: 150,
    group: "review_identity",
  },
  {
    name: "review_feature",
    label: "Feature",
    description:
      'Registry feature name under the domain. "Not assigned" when the row carries no feature or points at one the registry no longer has. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    sortOrder: 160,
    group: "review_identity",
  },
  {
    name: "review_created_at",
    label: "Filed at",
    description:
      "ISO timestamp of when the agent filed this review row. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 170,
    group: "review_identity",
  },
  {
    name: "review_updated_at",
    label: "Last activity",
    description:
      "ISO timestamp of the row's last change — the value the queue sorts and filters on. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 180,
    group: "review_identity",
  },
  {
    name: "review_instructions",
    label: "Review instructions",
    description:
      "What the filing agent asked a reviewer to check on the target page. Prose, sometimes long. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    sortOrder: 200,
    group: "review_content",
  },
  {
    name: "review_feedback",
    label: "Last recorded feedback",
    description:
      "The most recent feedback SAVED on the row. Absent when nobody has sent feedback back yet. The full multi-round history is the review's conversation, not this field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 210,
    group: "review_content",
  },
  {
    name: "review_conversation_id",
    label: "Review conversation",
    description:
      "UUID of the `communication.dm_conversations` thread that carries every round of this review, embedded on this page and also reachable at /messages/[conversationId]. Absent on legacy rows filed before threads existed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 220,
    group: "review_content",
  },
  {
    name: "review_triage",
    label: "Repair routing",
    description:
      "The row's versioned `metadata.triage` envelope: { version, lane, required_tools, workstreams, priority, assignment, verification }. Absent when the row has no triage envelope or it fails validation — such a row cannot be claimed by the repair worker. Bindable, not auto-context.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 230,
    group: "review_content",
  },
  {
    name: "feedback_draft",
    label: "Feedback draft",
    description:
      "Live contents of the review editor on this page — what the human is about to send back, before any button is pressed. Empty string when the editor is empty (it is cleared after every recorded action). Always present. Read twin of the `review_feedback_draft` write target.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 500,
    sortOrder: 300,
    group: "review_editor",
  },
  {
    name: "can_act",
    label: "Human actions available",
    description:
      "True when this row is in ready_for_human and a signed-in human can Request changes or Approve it right now. False in every other status, where the only available action is running the agent review again. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "review_editor",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "review_feedback_draft",
    label: "Review feedback draft",
    description:
      "Stages review feedback into the editor on this page — the same buffer the human types into. String value: plain prose (newlines fine) that REPLACES the whole editor, so include anything already in feedback_draft that should survive; an empty string clears it. Nothing is written to the database and no status moves: the human reads the staged text and decides whether to press Request changes, Approve, or Run agent review again.",
    valueType: "string",
    updatesValue: "feedback_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "review_editor",
    sortOrder: 300,
  },
];

export const adminAgentReviewItemManifest: SurfaceManifest = {
  surfaceName: ADMIN_AGENT_REVIEW_ITEM_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest, emitter and the feedback-draft write target were built together on 2026-08-26. Still needs the live browser pass: open a review at /administration/users/agent-review/[id] as a super-admin, confirm the emitted scope in the Agents chrome, and stage one feedback draft end to end.",
  label: "Agent Review Item",
  urlPattern: "/administration/users/agent-review/[id]",
  intro: `<surface_intro>
This is an ADMIN surface: one open review at /administration/users/agent-review/[id], a single agent.review_queue row. Agent Review is an agent-first pipeline — agents submit, review, repair and verify each other's work, and only a row that reaches ready_for_human asks a person to look at all.

The page shows where the row sits on the stage rail, what the filing agent asked a reviewer to check (review_instructions), the target page under review (review_target_url), its registry classification (repository, domain, feature), and the durable conversation where every round of this review is a message. review_triage is the routing envelope a repair worker claims by.

The editor on the right is the human's own reply. feedback_draft is what is in it right now, unsaved; review_feedback is the last reply that was actually recorded. You may stage prose into that editor with review_feedback_draft — for example turning a rough note into precise, actionable instructions for the agent that will do the repair.

What you never do: change the row's status. Request changes, Approve, Run agent review again and Archive are human button presses, each recorded in the conversation as the human's own message, and no write target exists for them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminAgentReviewItemScope(values: {
  // alwaysAvailable: true → required
  review_id: string;
  review_title: string;
  review_status: ReviewStatus;
  review_target_url: string;
  review_repo_slug: string;
  review_domain: string;
  review_feature: string;
  review_created_at: string;
  review_updated_at: string;
  review_instructions: string;
  feedback_draft: string;
  can_act: boolean;
  // alwaysAvailable: false → optional
  review_feedback?: string;
  review_conversation_id?: string;
  review_triage?: ReviewTriage;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
