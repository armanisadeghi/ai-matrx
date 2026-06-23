import { toast } from "sonner";
import { Save, Trash2, CheckCircle2, CircleDashed } from "lucide-react";
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import { createTasksScope } from "@/features/surfaces/manifests/tasks.manifest";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";

/** Placements for the task editor (target wiring with surfaceName). */
export const TASKS_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.CONTENT_BLOCK,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/**
 * Shared menu props — target state for `/tasks` (the `matrx-user/tasks` surface).
 *
 * `sourceFeature` is trace-attribution only; `surfaceName` is what drives
 * surface-binding resolution. `"tasks"` is the surface's own attribution
 * literal in the `SourceFeature` union (`features/agents/`).
 */
export const TASKS_CONTEXT_MENU_PROPS = {
  sourceFeature: "tasks" as const,
  surfaceName: "matrx-user/tasks" as const,
  isEditable: true as const,
  enabledPlacements: [...TASKS_CONTEXT_MENU_PLACEMENTS],
};

/** A child task as the surface emits it in `subtasks`. */
export interface TasksContextSubtask {
  id: string;
  title: string;
  status?: string;
}

export interface BuildTasksContextDataArgs {
  /** UUID of the active task, or empty when none is open. */
  taskId: string;
  /** Current (draft-or-saved) title of the active task. */
  title: string;
  /** Current (draft-or-saved) description / notes body — the editable text. */
  description: string;
  /**
   * Live selection range within the description editor. Pass the textarea's
   * `selectionStart` / `selectionEnd`; defaults to a collapsed caret at 0.
   */
  selectionStart?: number;
  selectionEnd?: number;
  /** DB status value of the active task (`completed` | `not_started` | …). */
  status?: string | null;
  /** DB priority value (`low` | `medium` | `high`) or null. */
  priority?: string | null;
  /** ISO date the task is due, or null. */
  dueDate?: string | null;
  /** Parent project id (null = unassigned). */
  projectId?: string | null;
  /** Parent project display name, when known. */
  projectName?: string | null;
  /** Child tasks of the active task. */
  subtasks?: TasksContextSubtask[];
}

/**
 * Normalize a DB task `status` into the surface vocabulary the manifest
 * declares for `active_task_status`: `"completed" | "pending" | "overdue"`.
 *
 * The `ctx_tasks.status` column carries lifecycle-ish values (`completed`,
 * `not_started`, `incomplete`, …); anything not `completed` is "pending" for
 * an agent's purposes, and a non-completed task past its due date is "overdue".
 */
function deriveSurfaceStatus(
  status: string | null | undefined,
  dueDate: string | null | undefined,
): "completed" | "pending" | "overdue" | "" {
  if (status === "completed") return "completed";
  if (status == null && dueDate == null) return "";
  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    if (dueDate < todayStr) return "overdue";
  }
  return "pending";
}

/**
 * Canonical `contextData` for `matrx-user/tasks`.
 *
 * PURE map of the active task's live editor state → `createTasksScope(...)`,
 * using the EXACT SurfaceValue names the manifest declares. Real baselines
 * (`selection`/`content`/`context`) come from the description editor; the
 * task customs (id/title/description/priority/status/due/project/subtasks)
 * come from the active task. List-level values (`task_list`, `project_list`,
 * `task_count`, `search_query`) are intentionally omitted — the single-task
 * editor doesn't own the list and must not lie about it.
 *
 * Demo + production share this one shape.
 */
export function buildTasksContextData(
  args: BuildTasksContextDataArgs,
): Record<string, unknown> {
  const {
    taskId,
    title,
    description,
    selectionStart = 0,
    selectionEnd = 0,
    status,
    priority,
    dueDate,
    projectId,
    projectName,
    subtasks = [],
  } = args;

  const text = description ?? "";
  const taskOpen = Boolean(taskId);
  const hasSelection = selectionEnd > selectionStart;
  const selectedText = hasSelection
    ? text.slice(selectionStart, selectionEnd)
    : "";

  const surround = formatEditorSurroundContext(text, {
    selectionStart,
    selectionEnd,
  });

  const surfaceStatus = deriveSurfaceStatus(status, dueDate);

  const scope = createTasksScope({
    // ── Baselines (live editor) ──────────────────────────────────────────
    selection: selectedText || undefined,
    content: taskOpen ? text || undefined : undefined,
    context: surround,

    // ── Active task ──────────────────────────────────────────────────────
    active_task_id: taskOpen ? taskId : undefined,
    active_task_title: taskOpen ? title || undefined : undefined,
    active_task_description: taskOpen ? text || undefined : undefined,
    active_task_priority: priority || undefined,
    active_task_status: surfaceStatus || undefined,
    active_task_due_date: dueDate || undefined,
    subtasks: subtasks.length
      ? subtasks.map((s) => ({ id: s.id, title: s.title, status: s.status }))
      : undefined,

    // ── Project context ──────────────────────────────────────────────────
    active_project_id: projectId || undefined,
    active_project_name: projectName || undefined,
  });

  return scope as Record<string, unknown>;
}

/**
 * Task-specific menu items injected via `extraSections` (target wiring).
 * The core menu renders these; the tasks wrapper only describes them. Real
 * handlers are passed in by the host so the section can act on the live task
 * (save / toggle complete / delete) rather than reimplement those flows.
 */
export function createTasksExtraSections(handlers?: {
  onSave?: () => void;
  onToggleComplete?: () => void;
  onDelete?: () => void;
  completed?: boolean;
}): ContextMenuExtraSection[] {
  const completed = handlers?.completed ?? false;
  return [
    {
      id: "task-ops",
      label: "Task",
      anchor: "after-compare",
      items: [
        {
          kind: "item",
          id: "save",
          label: "Save",
          icon: Save,
          hint: "⌘S",
          onSelect: () =>
            handlers?.onSave
              ? handlers.onSave()
              : toast.success("Save task"),
        },
        {
          kind: "item",
          id: "toggle-complete",
          label: completed ? "Mark incomplete" : "Mark complete",
          icon: completed ? CircleDashed : CheckCircle2,
          onSelect: () =>
            handlers?.onToggleComplete
              ? handlers.onToggleComplete()
              : toast.success(completed ? "Marked incomplete" : "Marked complete"),
        },
        { kind: "separator", id: "sep" },
        {
          kind: "item",
          id: "delete",
          label: "Delete Task",
          icon: Trash2,
          destructive: true,
          onSelect: () =>
            handlers?.onDelete
              ? handlers.onDelete()
              : toast.error("Delete task"),
        },
      ],
    },
  ];
}
