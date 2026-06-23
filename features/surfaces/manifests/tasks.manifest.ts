/**
 * Surface manifest — Tasks (`matrx-user/tasks`).
 *
 * Task management and to-do lists (route `/tasks`). The user browses projects
 * and their tasks, opens a task to view/edit its details, filters and searches.
 *
 * Agents bound here operate on the active task (rewrite the description, break
 * into subtasks, estimate effort) or on the list (prioritize, summarize what's
 * due, generate a plan).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Active task (300-349) ─────────────────────────────────────────────
  {
    name: "active_task_id",
    label: "Active task ID",
    description:
      "UUID of the task the user has open/previewed. Empty when no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "active_task_title",
    label: "Active task title",
    description:
      "Title of the active task. Empty when no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 310,
  },
  {
    name: "active_task_description",
    label: "Active task description",
    description:
      "Full body / notes of the active task. Empty when unset or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 320,
  },
  {
    name: "active_task_priority",
    label: "Active task priority",
    description:
      '"low", "medium", "high", or empty. Empty when unset or no task is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 330,
  },
  {
    name: "active_task_status",
    label: "Active task status",
    description:
      '"completed", "pending", "overdue", or empty. Empty when unset or no task is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 335,
  },
  {
    name: "active_task_due_date",
    label: "Active task due date",
    description:
      "ISO 8601 due date of the active task. Empty when no due date or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 340,
  },
  {
    name: "subtasks",
    label: "Subtasks",
    description:
      "Array of child tasks of the active task as `{ id, title, status }`. Empty array when the task has no subtasks or no task is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 345,
  },

  // ── Project context (350-369) ─────────────────────────────────────────
  {
    name: "active_project_id",
    label: "Active project ID",
    description:
      'UUID of the parent project of the active task, or "unassigned". Empty when no task/project context exists.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 350,
  },
  {
    name: "active_project_name",
    label: "Active project name",
    description:
      "Name of the parent project. Empty when unassigned or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 355,
  },

  // ── List context (370-399) ────────────────────────────────────────────
  {
    name: "task_list",
    label: "Visible tasks",
    description:
      "Array of all tasks visible under the current filter/sort as `{ id, title, status, priority, due_date }`. Empty array when none are visible.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 370,
  },
  {
    name: "project_list",
    label: "Projects",
    description:
      "Array of the user's projects as `{ id, name, task_count }`. Empty array when none exist.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 380,
  },
  {
    name: "task_count",
    label: "Task count",
    description:
      "Total number of tasks currently visible. Zero when none.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 385,
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "Current task search string. Empty when the search box is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 390,
  },
];

export const tasksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/tasks",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createTasksScope(values: {
  selection?: string;
  content?: string;
  // Allow the editor-surround blob (a string) as well as a structured bag,
  // matching the Notes convention; the launcher normalizes a string `context`.
  context?: Record<string, unknown> | string;
  text_before?: string;
  text_after?: string;
  active_task_id?: string;
  active_task_title?: string;
  active_task_description?: string;
  active_task_priority?: string;
  active_task_status?: string;
  active_task_due_date?: string;
  subtasks?: Array<{ id: string; title: string; status?: string }>;
  active_project_id?: string;
  active_project_name?: string;
  task_list?: unknown[];
  project_list?: unknown[];
  task_count?: number;
  search_query?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
