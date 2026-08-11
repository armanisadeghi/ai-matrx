/**
 * Surface manifest — Quick Tasks (`matrx-user/quick-tasks`).
 *
 * Overlay surface for the Quick Tasks floating window
 * (`features/window-panels/windows/context-scopes/QuickTasksWindow.tsx`,
 * overlay id `quickTasksWindow`). A cross-app task cockpit: hierarchy cascade
 * (org → scope → project → task) + searchable task list in the sidebar, a
 * task-details panel (or quick-add input) in the main pane. All window state
 * lives in Redux (`quickTasksWindowSlice` + `taskUiSlice`), so the emitter
 * reads live store state at trigger time. The surface only exists while the
 * window is open — every "always available" promise below means "always
 * while mounted".
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { TASK_PRIORITIES } from "@/features/tasks/constants/priority";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const QUICK_TASKS_SURFACE_NAME = "matrx-user/quick-tasks";

const groups: SurfaceValueGroup[] = [
  {
    key: "window_selection",
    label: "Window selection",
    sortOrder: 100,
    description:
      "What the user has scoped the window to: organization, project, search query.",
  },
  {
    key: "task_list",
    label: "Task list",
    sortOrder: 200,
    description: "The tasks currently visible in the window's sidebar list.",
  },
  {
    key: "selected_task",
    label: "Selected task",
    sortOrder: 300,
    description:
      "The task open in the details panel, when one is selected.",
  },
  {
    key: "quick_add",
    label: "Quick add",
    sortOrder: 400,
    description: "The inline new-task capture input.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Window selection ──────────────────────────────────────────────────
  {
    name: "selected_org_id",
    label: "Selected organization ID",
    description:
      "UUID of the organization the window is scoped to. Seeded from the app's active org on open; empty only before the hierarchy loads or when the user has no orgs.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "window_selection",
  },
  {
    name: "selected_project_id",
    label: "Selected project ID",
    description:
      "UUID of the project the window's list is filtered to. Empty when the window is showing all projects (the default on open).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "window_selection",
  },
  {
    name: "show_all_projects",
    label: "Showing all projects",
    description:
      "True when the list spans every project (default while the window is open); false when filtered to one project. Always populated while the window is mounted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "window_selection",
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "The live text in the window's task search box. Empty string when the user is not searching. Always populated while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "window_selection",
  },

  // ── Task list ─────────────────────────────────────────────────────────
  {
    name: "visible_tasks",
    label: "Visible tasks",
    description:
      "The tasks currently shown in the sidebar after org/project/search filtering — one entry per task with { id, title, completed, priority, due_date, project_id, project_name }. Always populated while mounted; empty array when nothing matches.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    sortOrder: 400,
    group: "task_list",
  },
  {
    name: "visible_task_count",
    label: "Visible task count",
    description:
      "Number of tasks in `visible_tasks`. Always populated while the window is mounted.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "task_list",
  },

  // ── Selected task ─────────────────────────────────────────────────────
  {
    name: "selected_task_id",
    label: "Selected task ID",
    description:
      "UUID of the task open in the details panel. Empty when no task is selected (the quick-add empty state is showing instead).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 500,
    group: "selected_task",
  },
  {
    name: "selected_task_summary",
    label: "Selected task summary",
    description:
      "Composite of the selected task as one object: { id, title, completed, description, priority, due_date, labels, project_id, project_name }. Mirrors the individual selected_task_* values as one group value (completeness law). Absent when no task is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 510,
    group: "selected_task",
  },
  {
    name: "selected_task_title",
    label: "Selected task title",
    description:
      "Title of the task open in the details panel, as SAVED on the record. The panel's unsaved field drafts are not emitted, so this does not change when a title is merely staged. Empty when no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 520,
    group: "selected_task",
  },
  {
    name: "selected_task_description",
    label: "Selected task description",
    description:
      "Body / notes of the task open in the details panel, as SAVED on the record (markdown-friendly plain text). The panel's unsaved field drafts are not emitted, so this does not change when a description is merely staged. Empty when the task has no description or none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 530,
    group: "selected_task",
  },
  {
    name: "selected_task_priority",
    label: "Selected task priority",
    description: `Priority of the task open in the details panel, as SAVED on the record: ${TASK_PRIORITIES.join(" | ")}. Empty when the task has no priority or none is selected.`,
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 540,
    group: "selected_task",
  },
  {
    name: "selected_task_due_date",
    label: "Selected task due date",
    description:
      'Due date of the task open in the details panel, as SAVED on the record ("YYYY-MM-DD"). Empty when the task has no due date or none is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 550,
    group: "selected_task",
  },
  {
    name: "selected_task_labels",
    label: "Selected task labels",
    description:
      "Label strings currently on the task open in the details panel, as SAVED on the record. Empty array when the task has no labels or none is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 560,
    group: "selected_task",
  },

  // ── Quick add ─────────────────────────────────────────────────────────
  {
    name: "new_task_title",
    label: "New task title draft",
    description:
      "The draft text in the quick-add 'new task title' input. Empty string when the user has not typed anything. Always populated while the window is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 600,
    group: "quick_add",
  },
];

/**
 * Write half of the 360 loop — what an agent may write into the Quick Tasks
 * window. Two OWNERS, deliberately named apart:
 *
 *  - `quick_add_*` / `quick_create_task` are owned by `QuickTasksMain`, which
 *    owns the quick-add pane and the window's create path.
 *  - `panel_*` are owned by `TaskDetailsPanel`, which holds the open task's
 *    field drafts in LOCAL React state and has its own Save button. That
 *    panel is shared with `/tasks` and the Quick Tasks sheet, so it only
 *    registers handlers when a mount hands it a surface name — this window is
 *    the only one that does.
 *
 * WHY THE NAMES ARE NOT `task_title` / `task_description` (the `matrx-user/
 * tasks` spelling): this window is an OVERLAY. Open it while `/tasks` has a
 * task open and both surfaces are mounted at once, and `applySurfaceWrite`
 * resolves a target name against the DEEPEST surface that declares it — which
 * is the route's `TaskEditorBody`, not this overlay. Identical names would let
 * a write meant for the window land in the editor behind it, where the user
 * confirming the dialog cannot see it. Distinct names make the owner
 * unambiguous, and each description names its pane.
 *
 * WHAT IS DELIBERATELY NOT WRITABLE:
 *  - Saving the panel. `matrx-user/tasks` can offer `save_task` because its
 *    draft lives in Redux and the save thunk re-reads the store. This panel's
 *    draft is local React state, so a save handler would close over the render
 *    that registered it — stage a description and save in one agent turn and
 *    the save can run against the PRE-staged values. The user presses Save.
 *  - Deleting a task, and toggling complete/incomplete. Destructive or
 *    commitment-closing; those stay human.
 *  - The hierarchy cascade (organization / scope / project) and
 *    `selected_task_id`. That is navigation and ownership context, not
 *    authored content — and the window emits the selected ids without the
 *    lists to pick from, so an agent has no way to name a legal value.
 *  - `search_query` and `show_all_projects` — pure-mechanical view state
 *    nobody would ask an agent to flip.
 *  - The comment box. Posting is outward-facing communication to other people;
 *    left for a later pass rather than opened by omission.
 */
const writeTargets: SurfaceWriteTarget[] = [
  // ── Quick add (owner: QuickTasksMain) ─────────────────────────────────
  {
    name: "quick_add_title",
    label: "Quick-add task title",
    description: [
      "Stages a title into the Quick Tasks quick-add input — the same box the user types in, staged the same way, so they read it before anything is created.",
      "Value: a non-empty plain string. It REPLACES whatever is in the box; read new_task_title first if you mean to build on it.",
      "If a task is currently open in the details panel, that panel is closed first (exactly as the window's own Close Details button does) so the quick-add input, and your staged title, is what the user is looking at.",
      "Nothing is created. The user presses Add task.",
    ].join(" "),
    valueType: "string",
    updatesValue: "new_task_title",
    mode: "draft",
    applyPolicy: "ask",
    group: "quick_add",
    sortOrder: 100,
  },
  {
    name: "quick_create_task",
    label: "Create task",
    description: [
      "Creates a NEW task immediately through the window's canonical create path, then opens it in the details panel so the user can read, edit, or delete what was made.",
      `Value: an object with title (required, non-empty string) and any of description (string, markdown-friendly), priority (${TASK_PRIORITIES.join(" | ")}), due_date ("YYYY-MM-DD").`,
      "Pass the object itself — not a JSON string.",
      "The task inherits the window's current organization, project and scope selection; you cannot set those, and a task with no project selected lands unassigned.",
      "This is the target for turning a loose ask into one well-formed task. It saves on apply — use quick_add_title instead when you only have a title and want the user to press the button.",
    ].join(" "),
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "quick_add",
    sortOrder: 110,
  },

  // ── Selected task details panel (owner: TaskDetailsPanel) ─────────────
  {
    name: "panel_task_title",
    label: "Task title",
    description: [
      "Stages a new title into the task open in the Quick Tasks details panel.",
      "Value: a non-empty plain string, REPLACING the current title (read selected_task_title first if you mean to build on it).",
      "Staged only — the panel's Save button appears and the user saves.",
    ].join(" "),
    valueType: "string",
    updatesValue: "selected_task_title",
    mode: "draft",
    applyPolicy: "ask",
    group: "selected_task",
    sortOrder: 200,
  },
  {
    name: "panel_task_description",
    label: "Task description",
    description: [
      "Stages a full replacement body into the task open in the Quick Tasks details panel (markdown-friendly plain text).",
      "Value: a string; empty string clears it. It REPLACES the whole description — to append, read selected_task_description first and send the combined text.",
      "Staged only — the panel's Save button appears and the user saves.",
    ].join(" "),
    valueType: "string",
    updatesValue: "selected_task_description",
    mode: "draft",
    applyPolicy: "ask",
    group: "selected_task",
    sortOrder: 210,
  },
  {
    name: "panel_task_priority",
    label: "Task priority",
    description: [
      "Stages a priority onto the task open in the Quick Tasks details panel.",
      `Value: exactly one of ${TASK_PRIORITIES.join(" | ")}, or null to clear it back to None.`,
      "Staged only — the panel's Save button appears and the user saves.",
    ].join(" "),
    valueType: "string",
    updatesValue: "selected_task_priority",
    mode: "draft",
    applyPolicy: "ask",
    group: "selected_task",
    sortOrder: 220,
  },
  {
    name: "panel_task_due_date",
    label: "Task due date",
    description: [
      "Stages a due date onto the task open in the Quick Tasks details panel.",
      'Value: a date-only string "YYYY-MM-DD", or null (or "") to clear the date.',
      "Staged only — the panel's Save button appears and the user saves.",
    ].join(" "),
    valueType: "string",
    updatesValue: "selected_task_due_date",
    mode: "draft",
    applyPolicy: "ask",
    group: "selected_task",
    sortOrder: 230,
  },
  {
    name: "panel_task_labels",
    label: "Task labels",
    description: [
      "Stages the FULL label set onto the task open in the Quick Tasks details panel.",
      "Value: an array of label strings drawn from bug | feature | improvement | docs | design | research | question | blocked. Send [] to clear every label.",
      "It REPLACES the set rather than appending — read selected_task_labels and include the ones you want kept.",
      "Staged only — the panel's Save button appears and the user saves.",
    ].join(" "),
    valueType: "array",
    updatesValue: "selected_task_labels",
    mode: "draft",
    applyPolicy: "ask",
    group: "selected_task",
    sortOrder: 240,
  },
  {
    name: "panel_add_subtasks",
    label: "Add subtasks",
    description: [
      "Creates child subtasks under the task open in the Quick Tasks details panel, immediately, through the panel's own create path (organization and project inherited from the parent).",
      "Value: a non-empty array of subtask title strings, in the order they should appear.",
      "This one SAVES on apply — the subtasks exist as soon as the user approves. It adds to the existing subtask list and never removes anything.",
    ].join(" "),
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    group: "selected_task",
    sortOrder: 250,
  },
];

export const quickTasksManifest: SurfaceManifest = {
  surfaceName: QUICK_TASKS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Window-level Redux state and the selected task's saved fields are emitted, and all eight write targets are live-verified; TaskDetailsPanel's UNSAVED field drafts are still not emitted, so a staged value is visible on screen but not readable back through the selected_task_* values",
  overlayId: "quickTasksWindow",
  label: "Quick Tasks",
  intro: `<surface_intro>
You are in the Quick Tasks floating window — a cross-app task cockpit the user opens from anywhere. The sidebar holds a hierarchy cascade (organization, scope, project, task) plus a searchable task list; the main pane shows either the selected task's details or a quick-add input for capturing a new task.
Window selection tells you what slice of the user's tasks is in view; Task list is exactly what the sidebar shows after filtering; Selected task identifies the task in the details panel (absent when none is open); Quick add carries any unsent draft title. All values reflect the live window and only exist while it is open.

You can write here, and which targets are offered depends on what the window is showing. With no task selected you get the quick-add pane: quick_add_title stages a title into the input for the user to submit, and quick_create_task turns a loose ask into one well-formed task (title, description, priority, due date) and opens it. With a task open you also get the panel_* targets for its title, description, priority, due date and labels — those are staged into the panel and the USER presses Save — plus panel_add_subtasks, which creates subtasks on apply.
The selected_task_* values report the task as SAVED. They do not echo a staged edit back to you, so do not read them to confirm a stage landed; the apply result already told you.
Which organization, scope, project or task is selected is the user's navigation, not yours, and neither deleting a task nor marking one complete is available to you. Ask for those instead of trying to write them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // The window has no text editor; `context` remains the generic escape
    // valve. Other baselines are injected automatically by the registry.
    pickBaseline("context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One task entry as emitted in `visible_tasks`. */
export interface QuickTasksVisibleTaskEntry {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high" | null;
  due_date: string;
  project_id: string;
  project_name: string;
}

/** The composite emitted as `selected_task_summary`. */
export interface QuickTasksSelectedTaskSummary
  extends QuickTasksVisibleTaskEntry {
  description: string;
  labels: string[];
}

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createQuickTasksScope(values: {
  show_all_projects: boolean;
  search_query: string;
  visible_tasks: QuickTasksVisibleTaskEntry[];
  visible_task_count: number;
  new_task_title: string;
  selected_org_id?: string;
  selected_project_id?: string;
  selected_task_id?: string;
  selected_task_summary?: QuickTasksSelectedTaskSummary;
  selected_task_title?: string;
  selected_task_description?: string;
  selected_task_priority?: string;
  selected_task_due_date?: string;
  selected_task_labels?: string[];
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
