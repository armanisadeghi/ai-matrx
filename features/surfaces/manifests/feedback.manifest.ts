/**
 * Surface manifest — Feedback (`matrx-user/feedback`).
 *
 * Overlay surface for the feedback capture window
 * (`features/window-panels/windows/FeedbackWindow.tsx`, overlay id
 * `feedbackDialog`). The user files a bug / feature / suggestion into the
 * platform feedback system: a type picker, a free-text description (the
 * window's primary content — mirrored to the baseline `content`), optional
 * attachments (screenshots, files), and — for admins — category/assignee
 * routing.
 *
 * READ and WRITE: `FeedbackWindow` mounts this surface's provider (its first —
 * the manifest was authored from a window-component audit and had no emitter
 * at all), publishing the live form state and registering the one write
 * handler. See the `writeTargets` block below for which fields earn a target
 * and which deliberately do not.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { FEEDBACK_TYPES } from "@/types/feedback.types";
import { FEEDBACK_DRAFT_FIELDS } from "@/features/window-panels/windows/feedbackDraftWrite";
import {
  BASELINE_VALUES,
  mergeBaselineValues,
  pickBaseline,
} from "./_baseline.manifest";

export const FEEDBACK_SURFACE_NAME = "matrx-user/feedback";

const groups: SurfaceValueGroup[] = [
  {
    key: "feedback_form",
    label: "Feedback form",
    sortOrder: 100,
    description: "The feedback being composed: type, description, attachments.",
  },
  {
    key: "submission_state",
    label: "Submission state",
    sortOrder: 200,
    description: "Where the submission stands and any routing choices.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Feedback form ─────────────────────────────────────────────────────
  {
    name: "feedback_type",
    label: "Feedback type",
    description: `The selected feedback type, one of: ${FEEDBACK_TYPES.join(" | ")}. Always populated while the window is mounted (defaults to "bug").`,
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "feedback_form",
  },
  {
    // Baseline override: `content` IS the feedback description draft.
    ...BASELINE_VALUES.content,
    description:
      "The feedback description the user is composing. Empty string until they type. Always present while the window is open.",
    alwaysAvailable: true,
    typicalCharCount: 600,
    group: "feedback_form",
  },
  {
    name: "attachment_count",
    label: "Attachment count",
    description:
      "Number of attachments (screenshots, files) added to the feedback. Always populated while the window is mounted; 0 when none.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "feedback_form",
  },

  // ── Submission state ──────────────────────────────────────────────────
  {
    name: "submitted",
    label: "Submitted",
    description:
      "True once the feedback has been successfully submitted in this window (the success state is showing). Always populated while the window is mounted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "submission_state",
  },
  {
    name: "submitted_item_id",
    label: "Submitted item ID",
    description:
      "ID of the created feedback item. Absent until a submission succeeds.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 410,
    group: "submission_state",
  },
  {
    name: "error_message",
    label: "Submission error",
    description:
      "Error text shown when the last submission attempt failed. Absent when there is no error.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 420,
    group: "submission_state",
  },
  {
    name: "category_id",
    label: "Category (admin)",
    description:
      "Admin-only routing: the feedback category chosen in the admin options panel. Absent for non-admins or when left unset. Bindable-only.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 430,
    group: "submission_state",
  },
  {
    name: "assignee_id",
    label: "Assignee (admin)",
    description:
      "Admin-only routing: the admin the item is pre-assigned to. Absent for non-admins or when left unset. Bindable-only.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 440,
    group: "submission_state",
  },
];

/**
 * Write half of the 360 loop — what an agent may put into the feedback form.
 *
 * JUDGMENT BAR, applied honestly. This surface has exactly one field that is
 * the textbook YES: the DESCRIPTION. An agent that just watched the user hit a
 * bug can write a far better report than the user will type — the route, the
 * steps that led there, what was expected versus what happened. That is
 * authored content an agent drafts better and faster, which is the whole test.
 * `feedback_type` is the same judgment one field over: an agent that can write
 * the repro can also tell a crash from a wish.
 *
 * ONE object target, not two. The type is not an independent decision — it is
 * the CLASSIFICATION OF THE DESCRIPTION, derived from the same observation in
 * the same instant. Staging a "the editor crashes when I paste" body while
 * leaving the chips on "feature" would produce an incoherent report that reads
 * as the agent's mistake. Per the `surface-write-targets` trap ("multiple
 * values in one field object beat five micro-targets when they're edited
 * together") and the `image-generate` `generation_request` precedent, one
 * target also means ONE confirm dialog for one report instead of two in a row.
 * Both keys are OPTIONAL and partial — sending only `{feedback_type}` leaves a
 * description the user typed untouched, and sending only `{description}` is
 * the common case when they already picked the chip — so the granularity of
 * separate targets survives without the dialog spam. This is NOT the
 * `marketing-crawls` shape, where the targets are separate because they are
 * separate decisions with separate consumers.
 *
 * It also makes the payload atomic where it matters: the writeback seam
 * resolves every staged handler BEFORE the user confirms the first dialog, so
 * two interdependent targets could each act on a different snapshot of the
 * form. One object cannot.
 *
 * `mode: "draft"` in the literal sense — the handler calls the SAME `useState`
 * setters the textarea's `onChange` and the type chips' `onClick` call, so the
 * value is visible and editable the instant it lands. There is no Save bar
 * because nothing exists in the database until submit.
 *
 * WHAT IS NOT WRITABLE, on purpose:
 *  - **Submit.** The agent drafts; the human presses Submit. Same line
 *    `image-generate` drew at Generate, `scraper` at Scrape, and
 *    `quick-note-save` at Save Note — filing a report under the user's name
 *    into the platform tracker is theirs to commit, and it notifies real
 *    people. The handler additionally REFUSES while a submit is in flight and
 *    once the window has flipped to its success state.
 *  - **`category_id` / `assignee_id`** (admin routing). Deciding which admin
 *    gets handed a ticket is ORG WORKFLOW, not authored content — it is the
 *    ownership/identity class the bar excludes, and the assignee gets an
 *    in-app message and an email as a side effect. An agent has no standing to
 *    make that call, so neither field is declared.
 *  - **`attachments`.** Real uploaded Files with storage URLs. An agent cannot
 *    produce a screenshot, and there is nothing here to write.
 *  - The submission record — `submitted`, `submitted_item_id`,
 *    `error_message`. That is the account of what the server actually did; an
 *    agent writing it would be fabricating an outcome.
 *
 * The handler validates through the PURE `parseFeedbackDraft`
 * (`features/window-panels/windows/feedbackDraftWrite.ts`) and THROWS on a bad
 * shape, so the failure lands synchronously in the seam and comes back to the
 * agent as a message it can act on.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "feedback_draft",
    label: "Feedback draft",
    description: [
      "Stages the feedback report into the open window — the same fields the user would fill in themselves, staged the same way. NOTHING is filed: the user reviews what you staged and presses Submit.",
      `Value: an object with AT LEAST ONE of \`{ ${FEEDBACK_DRAFT_FIELDS.join(", ")} }\`. Send it as structured arguments, never as a JSON-encoded string. Each key REPLACES that one field wholesale; omit a key to leave the user's value exactly as they left it.`,
      "`description` — the report body, and the reason this target exists: write the concrete thing that happened, the route it happened on, the steps to reproduce it, and what was expected instead. It is PLAIN TEXT, not JSON and not JSON-encoded — real line breaks, no surrounding quotes, no escape sequences. It REPLACES the whole textarea, so read the `content` value first and send back the complete text you want (the user's own words plus your detail), not just your addition. Empty or whitespace-only is refused.",
      `\`feedback_type\` — the classification chip, exactly one of: ${FEEDBACK_TYPES.join(" | ")} (lower-case). Anything else is refused rather than coerced. Keep it consistent with the description you send: a crash report filed as "feature" is a worse report than no classification at all.`,
      "The write is refused while a submission is in flight, and once this window has been submitted (it is showing the success state and the form is gone).",
      "You cannot submit the feedback, add or remove attachments, or set the admin category/assignee — those stay with the user.",
    ].join(" "),
    valueType: "object",
    // No `updatesValue`: this one target covers TWO declared read values
    // (`content` and `feedback_type`), so there is no 1:1 read twin to name.
    // Both are emitted live by the window, and the description above points
    // the agent at `content` before a replacing write — the evidence loop is
    // intact, it just does not fit this single-name field.
    mode: "draft",
    applyPolicy: "ask",
    group: "feedback_form",
    sortOrder: 500,
  },
];

export const feedbackManifest: SurfaceManifest = {
  surfaceName: FEEDBACK_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired on FeedbackWindow (type, description, attachment count, submission state and admin routing all live) and the write half (feedback_draft) is registered and live-verified against a real agent run; the window's route and username lines are shown to the user but not yet declared as values",
  overlayId: "feedbackDialog",
  label: "Feedback",
  intro: `<surface_intro>
You are in the Feedback window — the user is filing a bug report, feature request, or suggestion into the platform feedback tracker. Feedback form carries the chosen type, the description draft (the baseline content), and any attachments; Submission state tells you whether it has been sent, the created item id, and any admin routing choices. Helping here usually means sharpening the description into a clear, actionable report.
You can also WRITE to this surface through the single feedback_draft target: the report body and the type chip that classifies it. This is exactly the moment those are worth writing — you have just watched what happened, and you can describe the route, the steps, and the expected-versus-actual far better than the user is about to type. Read the current content first and send back the complete text you want, since it replaces the whole textarea. Everything is STAGED into the open form; the user reads it and presses Submit.
You cannot submit the feedback, attach screenshots, or set the admin category and assignee — filing the report and deciding who is handed the ticket stay with the user.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
  writeTargets,
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createFeedbackScope(values: {
  feedback_type: "bug" | "feature" | "suggestion" | "other";
  content: string;
  attachment_count: number;
  submitted: boolean;
  submitted_item_id?: string;
  error_message?: string;
  category_id?: string;
  assignee_id?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
