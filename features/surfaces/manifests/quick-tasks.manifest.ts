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
} from "@/features/surfaces/types";
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
      "Composite of the selected task as one object: { id, title, completed, description, priority, due_date, project_id, project_name }. Absent when no task is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 510,
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

export const quickTasksManifest: SurfaceManifest = {
  surfaceName: QUICK_TASKS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Window-level Redux state fully audited and emitted; TaskDetailsPanel in-panel edit state (field drafts) is not emitted",
  overlayId: "quickTasksWindow",
  label: "Quick Tasks",
  intro: `<surface_intro>
You are in the Quick Tasks floating window — a cross-app task cockpit the user opens from anywhere. The sidebar holds a hierarchy cascade (organization, scope, project, task) plus a searchable task list; the main pane shows either the selected task's details or a quick-add input for capturing a new task.
Window selection tells you what slice of the user's tasks is in view; Task list is exactly what the sidebar shows after filtering; Selected task identifies the task in the details panel (absent when none is open); Quick add carries any unsent draft title. All values reflect the live window and only exist while it is open.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // The window has no text editor; `context` remains the generic escape
    // valve. Other baselines are injected automatically by the registry.
    pickBaseline("context"),
    surfaceSpecific,
  ),
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
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
