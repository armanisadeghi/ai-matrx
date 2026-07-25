/**
 * Surface manifest — Task Quick Create (`matrx-user/task-create`).
 *
 * Overlay surface for the one-shot task-capture window
 * (`features/window-panels/windows/tasks/TaskQuickCreateWindow.tsx`,
 * overlay id `taskQuickCreateWindow`). Each invocation is a fresh capture:
 * an optional source entity to link the new task to (a chat message, note,
 * file, …) plus optional pre-populated title/description/priority. The live
 * form state (edited title, refined description, project, scopes, due date)
 * lives inside `TaskQuickCreateCore` and is not yet threaded up to the
 * emitter — the window emits its opener payload. The surface only exists
 * while the window is open.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const TASK_CREATE_SURFACE_NAME = "matrx-user/task-create";

const groups: SurfaceValueGroup[] = [
  {
    key: "capture_source",
    label: "Capture source",
    sortOrder: 100,
    description:
      "The entity this capture was launched from — the thing the new task will be linked to.",
  },
  {
    key: "prefill",
    label: "Prefilled fields",
    sortOrder: 200,
    description: "Seed values the opener handed the form.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Capture source ────────────────────────────────────────────────────
  {
    name: "has_source",
    label: "Has source entity",
    description:
      "True when this capture was launched from a specific entity (message, note, file, …) the new task will link to; false for a blank capture. Always populated while the window is mounted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "capture_source",
  },
  {
    name: "source_entity_type",
    label: "Source entity type",
    description:
      "Entity type of the capture source (e.g. message, note, cld_files). Absent for a blank capture.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 310,
    group: "capture_source",
  },
  {
    name: "source_entity_id",
    label: "Source entity ID",
    description:
      "UUID of the capture source entity. Absent for a blank capture.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "capture_source",
  },
  {
    name: "source_label",
    label: "Source label",
    description:
      "Human label of the capture source as shown on the attachment chip. Absent when the opener did not provide one or for a blank capture.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 330,
    group: "capture_source",
  },

  // ── Prefilled fields ──────────────────────────────────────────────────
  {
    name: "prefill_title",
    label: "Prefilled title",
    description:
      "Task title the opener seeded the form with. Absent when the form started blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 400,
    group: "prefill",
  },
  {
    name: "prefill_description",
    label: "Prefilled description",
    description:
      "Task description the opener seeded the form with (e.g. the captured message text). Also emitted as the baseline `content`. Absent when the form started blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 410,
    group: "prefill",
  },
  {
    name: "prefill_priority",
    label: "Prefilled priority",
    description:
      "Priority (low / medium / high) the opener seeded the form with. Absent when none was provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 420,
    group: "prefill",
  },
];

export const taskCreateManifest: SurfaceManifest = {
  surfaceName: TASK_CREATE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Opener payload (source + prefill) audited and emitted; live form state inside TaskQuickCreateCore (edited title/description, project, scopes, due date) is not yet emitted",
  overlayId: "taskQuickCreateWindow",
  label: "Task Quick Create",
  intro: `<surface_intro>
You are in the Task Quick Create floating window — a one-shot capture form for creating a task from anywhere in the app. When Capture source values are present, the capture was launched from a specific entity (a chat message, note, file, …) and the created task will be linked to it; Prefilled fields carry whatever seed content the opener handed the form (the baseline content mirrors the prefilled description). The user may edit every field before saving — the values here describe how the form STARTED, not necessarily what will be saved.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // `content` mirrors the prefilled description — the window's primary text.
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createTaskCreateScope(values: {
  has_source: boolean;
  source_entity_type?: string;
  source_entity_id?: string;
  source_label?: string;
  prefill_title?: string;
  prefill_description?: string;
  prefill_priority?: "low" | "medium" | "high";
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
