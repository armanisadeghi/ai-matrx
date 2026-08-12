/**
 * Surface manifest — Tasks (`matrx-user/tasks`).
 *
 * Task management and to-do lists (route `/tasks`). The user browses projects
 * and their tasks, opens a task to view/edit its details, filters and searches.
 * The primary emitter is the task editor (`TaskEditorBody` — the shared content
 * surface of the inline editor, embedded tiles, and the floating Tasks window),
 * which emits the active task's live state via `buildTasksContextData`
 * (`features/tasks/agent-context/buildTasksContextData.ts`).
 *
 * Agents bound here operate on the active task (rewrite the description, break
 * into subtasks, estimate effort) or on the list (prioritize, summarize what's
 * due, generate a plan).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { TASK_LABELS } from "@/features/tasks/constants/labels";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "task_identity",
    label: "Task identity",
    sortOrder: 100,
    description: "Which task the user has open and its record metadata.",
  },
  {
    key: "task_content",
    label: "Task content",
    sortOrder: 200,
    description: "The active task's body and its child subtasks.",
  },
  {
    key: "task_meta",
    label: "Task metadata",
    sortOrder: 300,
    description:
      "Lifecycle and planning fields of the active task: status, priority, due date, labels, assignee.",
  },
  {
    key: "task_collaboration",
    label: "Collaboration",
    sortOrder: 400,
    description: "The comment thread on the active task.",
  },
  {
    key: "project_context",
    label: "Project context",
    sortOrder: 500,
    description: "The parent project the active task belongs to.",
  },
  {
    key: "list_context",
    label: "List context",
    sortOrder: 600,
    description:
      "The surrounding task list. Only populated by list-level mounts — the single-task editor does not own the list and never emits these.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Task identity ─────────────────────────────────────────────────────
  {
    name: "active_task_id",
    label: "Active task ID",
    description:
      "UUID of the task the user has open/previewed. Empty when no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "task_identity",
  },
  {
    name: "active_task_title",
    label: "Active task title",
    description: "Title of the active task. Empty when no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 310,
    group: "task_identity",
  },
  {
    name: "active_task_created_at",
    label: "Active task created at",
    description:
      "ISO timestamp when the active task was created. Empty while record metadata is still loading or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 315,
    group: "task_identity",
  },
  {
    name: "active_task_owner_id",
    label: "Active task owner ID",
    description:
      "UUID of the user who created the active task. Empty while record metadata is still loading or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 317,
    group: "task_identity",
  },
  {
    name: "active_task",
    label: "Active task",
    description:
      "The composite active-task object: { id, title, description, status, priority, due_date, labels, assignee_id, project_id, project_name, created_at }. Mirrors the individual active-task values as one group value (completeness law). Empty when no task is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    sortOrder: 320,
    group: "task_identity",
  },

  // ── Task content ──────────────────────────────────────────────────────
  {
    name: "active_task_description",
    label: "Active task description",
    description:
      "Full body / notes of the active task (the live editor draft, not the last save). Empty when unset or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 330,
    group: "task_content",
  },
  {
    name: "subtasks",
    label: "Subtasks",
    description:
      "Array of child tasks of the active task as `{ id, title, status }`. Empty array when the task has no subtasks or no task is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 340,
    group: "task_content",
  },
  {
    name: "subtask_count",
    label: "Subtask count",
    description:
      "Number of child subtasks on the active task. Zero when the task has none; empty when no task is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 345,
    group: "task_content",
  },
  {
    name: "completed_subtask_count",
    label: "Completed subtasks",
    description:
      "Number of the active task's subtasks that are completed. Zero when none are done; empty when no task is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 347,
    group: "task_content",
  },

  // ── Task metadata ─────────────────────────────────────────────────────
  {
    name: "active_task_status",
    label: "Active task status",
    description:
      '"completed", "pending", "overdue", or empty. Empty when unset or no task is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 350,
    group: "task_meta",
  },
  {
    name: "active_task_priority",
    label: "Active task priority",
    description:
      '"low", "medium", "high", or empty. Empty when unset or no task is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 355,
    group: "task_meta",
  },
  {
    name: "active_task_due_date",
    label: "Active task due date",
    description:
      "ISO 8601 due date of the active task. Empty when no due date or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 360,
    group: "task_meta",
  },
  {
    name: "active_task_labels",
    label: "Active task labels",
    description:
      "Array of label strings applied to the active task (its tags/chips). Empty array when the task has no labels or no task is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 365,
    group: "task_meta",
  },
  {
    name: "active_task_assignee_id",
    label: "Active task assignee ID",
    description:
      "UUID of the user the active task is assigned to. Empty when unassigned or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 370,
    group: "task_meta",
  },

  // ── Collaboration ─────────────────────────────────────────────────────
  {
    name: "comments",
    label: "Comments",
    description:
      "The active task's comment thread, oldest first, as `{ id, body, created_at, author_name }`. Empty array while comments are loading, when the task has none, or when no task is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 380,
    group: "task_collaboration",
  },
  {
    name: "comment_count",
    label: "Comment count",
    description:
      "Number of comments on the active task. Zero when there are none (or while still loading); empty when no task is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 385,
    group: "task_collaboration",
  },

  // ── Project context ───────────────────────────────────────────────────
  {
    name: "active_project_id",
    label: "Active project ID",
    description:
      'UUID of the parent project of the active task, or "unassigned". Empty when no task/project context exists.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "project_context",
  },
  {
    name: "active_project_name",
    label: "Active project name",
    description:
      "Name of the parent project. Empty when unassigned or no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 410,
    group: "project_context",
  },

  // ── List context (list-level mounts only) ─────────────────────────────
  {
    name: "task_list",
    label: "Visible tasks",
    description:
      "Array of all tasks visible under the current filter/sort as `{ id, title, status, priority, due_date }`. Only populated by list-level mounts; the single-task editor never emits it. Empty array when none are visible.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 500,
    group: "list_context",
  },
  {
    name: "project_list",
    label: "Projects",
    description:
      "Array of the user's projects as `{ id, name, task_count }`. Only populated by list-level mounts. Empty array when none exist.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 510,
    group: "list_context",
  },
  {
    name: "task_count",
    label: "Task count",
    description:
      "Total number of tasks currently visible. Only populated by list-level mounts. Zero when none.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 520,
    group: "list_context",
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "Current task search string. Only populated by list-level mounts. Empty when the search box is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 530,
    group: "list_context",
  },
];

/**
 * Write half of the 360 loop — what an agent (or a rendered kind component)
 * may WRITE into the open task editor. Field targets are `mode: "draft"`:
 * they stage into the editor's Redux draft (`patchTaskEdit`) exactly as if
 * the user typed them — visible, reversible, saved only when the task is
 * saved. `add_subtasks` and `save_task` are the entity-mode actions.
 *
 * All targets are `applyPolicy: "ask"` — a task is the user's commitment
 * ledger, so every agent-originated change is confirmed in place. Handlers
 * are registered by `TaskEditorBody.tsx` on its SurfaceRuntimeProvider.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "task_title",
    label: "Task title",
    description:
      "Stages a new title into the open task's draft. Plain string; the user still saves.",
    valueType: "string",
    updatesValue: "active_task_title",
    mode: "draft",
    applyPolicy: "ask",
    group: "task_identity",
    sortOrder: 100,
  },
  {
    name: "task_description",
    label: "Task description",
    description:
      "Stages a full replacement description into the open task's draft (markdown-friendly plain text; the live editor content the user sees). The user still saves. To append, read active_task_description first and include the existing text.",
    valueType: "string",
    updatesValue: "active_task_description",
    mode: "draft",
    applyPolicy: "ask",
    group: "task_content",
    sortOrder: 200,
  },
  {
    name: "add_subtasks",
    label: "Add subtasks",
    description:
      "Creates child subtasks under the open task immediately (canonical create path; org/project inherited from the parent). Value: array of subtask title strings, in order.",
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    group: "task_content",
    sortOrder: 210,
  },
  {
    name: "task_status",
    label: "Task status",
    description:
      "Stages a lifecycle status into the draft. One of: inbox | planned | active | completed | cancelled | dismissed. The user still saves.",
    valueType: "string",
    updatesValue: "active_task_status",
    mode: "draft",
    applyPolicy: "ask",
    group: "task_meta",
    sortOrder: 300,
  },
  {
    name: "task_priority",
    label: "Task priority",
    description:
      "Stages a priority into the draft. One of: low | medium | high. The user still saves.",
    valueType: "string",
    updatesValue: "active_task_priority",
    mode: "draft",
    applyPolicy: "ask",
    group: "task_meta",
    sortOrder: 310,
  },
  {
    name: "task_due_date",
    label: "Task due date",
    description:
      "Stages a due date into the draft as a date-only string (YYYY-MM-DD), or null to clear. The user still saves.",
    valueType: "string",
    updatesValue: "active_task_due_date",
    mode: "draft",
    applyPolicy: "ask",
    group: "task_meta",
    sortOrder: 320,
  },
  {
    name: "task_labels",
    label: "Task labels",
    description: `Stages the FULL label set into the draft (replaces, not appends — include existing labels you want kept, from active_task_labels). Array of: ${TASK_LABELS.join(" | ")}.`,
    valueType: "array",
    updatesValue: "active_task_labels",
    mode: "draft",
    applyPolicy: "ask",
    group: "task_meta",
    sortOrder: 330,
  },
  {
    name: "save_task",
    label: "Save task",
    description:
      "Persists the editor's current staged draft through the canonical save path — equivalent to the user pressing Save. Value is ignored. No-op when nothing is staged.",
    valueType: "boolean",
    mode: "entity",
    applyPolicy: "ask",
    group: "task_identity",
    sortOrder: 110,
  },
];

export const tasksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/tasks",
  readiness: "verified",
  label: "Tasks",
  urlPattern: "/tasks",
  intro: `<surface_intro>
You are on the Tasks surface: the user's task editor and to-do lists. The primary mount is the single-task editor — the active_task_* values, subtasks, and comments describe the ONE task the user has open, and the baselines (content/selection/context) come from its description editor: content is the live description draft, selection is the user's highlighted text within it.
Description edits you propose act on the live draft the user sees. Status uses the surface vocabulary completed/pending/overdue (derived from the record's lifecycle status + due date).
List-level values (task_list, project_list, task_count, search_query) only appear on list mounts — when absent, you are on a single task and must not assume anything about the surrounding list.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One comment as the surface emits it in `comments`. */
export interface TasksScopeComment {
  id: string;
  body: string;
  created_at: string;
  author_name?: string;
}

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
  active_task_created_at?: string;
  active_task_owner_id?: string;
  active_task?: Record<string, unknown>;
  active_task_description?: string;
  subtasks?: Array<{ id: string; title: string; status?: string }>;
  subtask_count?: number;
  completed_subtask_count?: number;
  active_task_status?: string;
  active_task_priority?: string;
  active_task_due_date?: string;
  active_task_labels?: string[];
  active_task_assignee_id?: string;
  comments?: TasksScopeComment[];
  comment_count?: number;
  active_project_id?: string;
  active_project_name?: string;
  task_list?: unknown[];
  project_list?: unknown[];
  task_count?: number;
  search_query?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
