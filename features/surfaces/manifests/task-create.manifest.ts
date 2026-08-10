/**
 * Surface manifest — Task Quick Create (`matrx-user/task-create`).
 *
 * Overlay surface for the one-shot task-capture window
 * (`features/window-panels/windows/tasks/TaskQuickCreateWindow.tsx`,
 * overlay id `taskQuickCreateWindow`). Each invocation is a fresh capture:
 * an optional source entity to link the new task to (a chat message, note,
 * file, …) plus optional pre-populated title/description/priority.
 *
 * Two halves, and the difference matters: the Prefilled fields describe how
 * the form STARTED (the opener payload), while `task_draft` is what is in the
 * form RIGHT NOW — `TaskQuickCreateCore` publishes its live state into a ref
 * the window's `getScope` reads, so the read twin of the write target is the
 * actual form, not the seed.
 *
 * The surface only exists while the window is open. When it is closed nothing
 * registers it, so `apply_surface_write` is never offered and a call made
 * anyway fails loudly ("No surface is mounted…") rather than silently.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  TASK_PRIORITIES,
  type TaskPriorityValue,
} from "@/features/tasks/constants/priority";
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
  {
    key: "draft",
    label: "Live draft",
    sortOrder: 300,
    description:
      "What is in the capture form right now — the user's edits on top of the seed, and the only thing the Create button will save.",
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

  // ── Live draft ────────────────────────────────────────────────────────
  {
    name: "task_draft",
    label: "Task draft",
    description:
      "Everything in the capture form as it stands right now: `{ title, description, priority, due_date, project_id, scope_ids, link_scope, saved_task_id }`. `priority` is `\"\"` when none is chosen, otherwise one of the values in the task priority vocabulary; `due_date` is `\"\"` or `YYYY-MM-DD`; `scope_ids` is an array of scope UUIDs; `link_scope` is which side of a message capture gets linked (`message` / `conversation` / `both`) and is meaningless without a source. `saved_task_id` is null until the user presses Create task and the new task's UUID afterwards — once it is set the form is gone and nothing more can be staged. This is the LIVE truth; the Prefilled fields only say how the form started.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 900,
    sortOrder: 500,
    group: "draft",
  },
];

/**
 * The write half of this surface (handlers in
 * `features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx`).
 *
 * ONE composite target, deliberately — not one per input. This is a one-shot
 * capture form: everything on it is filled during a SINGLE act of drafting
 * (usually from the thing the window was opened from — a chat message, a note,
 * a file) and consumed by ONE save. Title, description, priority and due date
 * are not independent decisions here; they are one draft. That is exactly the
 * case the skill reserves for an object target, and it means the user is asked
 * once for one coherent proposal instead of four times for fragments.
 *
 * What is NOT writable, and why:
 *  - `project_id` / `scope_ids` — the surface emits the SELECTED ids but no
 *    menu of available projects or scopes, so an agent has no way to name a
 *    valid one. A target it cannot supply a legal value for is worse than no
 *    target.
 *  - `link_scope` and the source entity — which thing the new task hangs off
 *    is the whole point of a source-linked capture, and it is the human's
 *    call.
 *  - Creating the task. Save is where the link edges, org/project inheritance
 *    and scope assignments get written. The human presses Create task.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "task_draft",
    label: "Task draft",
    description: [
      "Stages a drafted task into the open Quick Create form — the same fields the user would type, staged the same way, so they see it before anything is created.",
      `Object with any of: title (non-empty string), description (string, markdown-friendly), priority (${TASK_PRIORITIES.join(" | ")}, or "" for none), due_date ("YYYY-MM-DD", or "" to clear).`,
      "Only the keys you send are changed; omit a key to leave the user's value alone. title and description REPLACE in full — to add to what is already there, read task_draft first and send the combined text.",
      "This form has no agent-writable project, scope, or source link: it publishes the selected ids but not the lists to pick from, and which entity the task attaches to is the user's decision. Do not try to set them.",
      "Nothing is saved. No task exists, no source link is written, and no scope is assigned until the user presses Create task — and once they have, this target is refused because the form is finished.",
    ].join(" "),
    valueType: "object",
    updatesValue: "task_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "draft",
    sortOrder: 500,
  },
];

export const taskCreateManifest: SurfaceManifest = {
  surfaceName: TASK_CREATE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Opener payload and the live form draft (task_draft) are both emitted and the task_draft write target is live-verified; the project and scope PICK LISTS the form renders are still not emitted, which is why neither is agent-writable",
  overlayId: "taskQuickCreateWindow",
  label: "Task Quick Create",
  intro: `<surface_intro>
You are in the Task Quick Create floating window — a one-shot capture form for creating a task from anywhere in the app. When Capture source values are present, the capture was launched from a specific entity (a chat message, note, file, …) and the created task will be linked to it; Prefilled fields carry whatever seed content the opener handed the form (the baseline content mirrors the prefilled description).

Prefilled fields say how the form STARTED. task_draft says what is in it NOW — always read that before you propose a change, and read it again to see what landed.

You can help write this task: the task_draft write target stages a title, description, priority and due date into the form. The window was almost always opened FROM something, so use that material — turn a rambling message into a title someone can act on, put the detail in the description, and infer priority and a due date only when the source actually supports them. Everything you stage is a proposal the user reviews; the human presses Create task. Project, scopes, and which entity the task links to are theirs alone.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // `content` mirrors the prefilled description — the window's primary text.
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * The live capture form, exactly as `task_draft` reports it. `TaskQuickCreateCore`
 * publishes this shape; the window's `getScope` hands it straight through.
 */
export interface TaskCreateDraftScope {
  title: string;
  description: string;
  /** `""` = no priority chosen (the form's "None" option). */
  priority: TaskPriorityValue | "";
  /** `""` = no due date, otherwise `YYYY-MM-DD`. */
  due_date: string;
  /** `""` = inherit the app-context project. */
  project_id: string;
  scope_ids: string[];
  link_scope: "message" | "conversation" | "both";
  /** Non-null once the task has been created — the form is finished. */
  saved_task_id: string | null;
}

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
  prefill_priority?: TaskPriorityValue;
  task_draft: TaskCreateDraftScope;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
