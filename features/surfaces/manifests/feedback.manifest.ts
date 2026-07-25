/**
 * Surface manifest — Feedback (`matrx-user/feedback`).
 *
 * Overlay surface for the feedback capture window
 * (`features/window-panels/windows/FeedbackWindow.tsx`, overlay id
 * `feedbackDialog`). The user files a bug / feature / suggestion into the
 * platform feedback system: a type picker, a free-text description (the
 * window's primary content — mirrored to the baseline `content`), optional
 * attachments (screenshots, files), and — for admins — category/assignee
 * routing. Emitter not wired yet.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
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
    description:
      'The selected feedback type: "bug", "feature", "suggestion", or "other". Always populated while the window is mounted (defaults to bug).',
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

export const feedbackManifest: SurfaceManifest = {
  surfaceName: FEEDBACK_SURFACE_NAME,
  readiness: "stub",
  readinessNote: "Manifest from window-component audit; emitter not wired",
  overlayId: "feedbackDialog",
  label: "Feedback",
  intro: `<surface_intro>
You are in the Feedback window — the user is filing a bug report, feature request, or suggestion into the platform feedback tracker. Feedback form carries the chosen type, the description draft (the baseline content), and any attachments; Submission state tells you whether it has been sent, the created item id, and any admin routing choices. Helping here usually means sharpening the description into a clear, actionable report.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
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
