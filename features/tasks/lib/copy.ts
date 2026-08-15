// features/tasks/lib/copy.ts
//
// The ONE place task surfaces build their Copy / Copy-for-AI / export
// payloads (components/agent-copy doctrine — see the `agent-copy` skill).
//
// THE LIVE-STATE LAW is the reason this module exists. The feature's only
// prior copy affordance, `TaskCopyForAiButton`, re-FETCHES the saved row via
// `aiExportService` — so a user who has typed into the editor and clicked
// "Copy for AI" hands the agent the text they just replaced. That export is
// still valuable (it walks the full tree: subtasks, comments, attachments,
// linked notes) and is preserved as a menu variant, but it is no longer the
// default. `buildTaskEditorPayload` builds from the LIVE draft overlay the
// editor is rendering and carries an explicit `unsaved_changes` diff against
// the saved record, so an agent can never mistake stale text for current.
//
// Pure — no React, no fetching. Callsites pass these as functions so they
// resolve at click time.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { AiVariant } from "@/components/agent-copy/AiCopyMenu";
import type { TaskWithProject } from "../types";

export const TASKS_LOCATION = "AI Matrx — Tasks (/tasks)";

export function taskDetailLocation(taskId: string, title?: string): string {
  return title
    ? `AI Matrx — Task "${title}" (/tasks/${taskId})`
    : `AI Matrx — Task (/tasks/${taskId})`;
}

function lines(
  rows: Array<[string, string | number | boolean | null | undefined]>,
): string {
  return rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

// ── List rows ──────────────────────────────────────────────────────────────

function labelsOf(task: TaskWithProject): string[] {
  const labels = (task.settings as { labels?: string[] } | undefined)?.labels;
  return Array.isArray(labels) ? labels : [];
}

/** One task, as the list row renders it. */
export function taskSummary(task: TaskWithProject): string {
  return lines([
    ["Task", task.title],
    ["Status", task.status],
    ["Project", task.projectName],
    ["Priority", task.priority],
    ["Due", task.dueDate],
    ["Start", task.startDate],
    ["Assignee", task.assigneeName ?? task.assigneeId],
    ["Labels", labelsOf(task).join(", ")],
    ["Repeats", task.recurrenceRule],
    ["Subtasks", task.subtasks?.length],
    ["Origin", task.origin],
    ["Source", task.sourceLabel ?? task.sourceUrl],
    ["Description", task.description],
  ]);
}

export function taskRow(task: TaskWithProject): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    completed: task.completed,
    project_id: task.projectId,
    project_name: task.projectName,
    priority: task.priority ?? null,
    due_date: task.dueDate || null,
    start_date: task.startDate ?? null,
    completed_at: task.completedAt ?? null,
    recurrence_rule: task.recurrenceRule ?? null,
    assignee_id: task.assigneeId ?? null,
    assignee_name: task.assigneeName ?? null,
    parent_task_id: task.parentTaskId ?? null,
    labels: labelsOf(task),
    subtask_count: task.subtasks?.length ?? 0,
    origin: task.origin ?? null,
    source_type: task.sourceType ?? null,
    source_url: task.sourceUrl ?? null,
    source_label: task.sourceLabel ?? null,
    description: task.description,
    updated_at: task.updatedAt ?? null,
  };
}

/** CSV flattens the array columns so a spreadsheet stays readable. */
export function taskCsvRows(
  tasks: TaskWithProject[],
): Array<Record<string, unknown>> {
  return tasks.map((task) => ({
    ...taskRow(task),
    labels: labelsOf(task).join("|"),
  }));
}

/** The list's leading numbers — what the pane's count line implies. */
export interface TaskListKpis {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  byStatus: Record<string, number>;
}

export function taskListKpis(
  tasks: TaskWithProject[],
  today = new Date().toISOString().slice(0, 10),
): TaskListKpis {
  const byStatus: Record<string, number> = {};
  let completed = 0;
  let overdue = 0;
  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    if (task.completed) completed++;
    else if (task.dueDate && task.dueDate < today) overdue++;
  }
  return {
    total: tasks.length,
    open: tasks.length - completed,
    completed,
    overdue,
    byStatus,
  };
}

export function taskKpiLine(kpis: TaskListKpis): string {
  return `${kpis.total} task${kpis.total === 1 ? "" : "s"} · ${kpis.open} open · ${kpis.completed} completed${kpis.overdue ? ` · ${kpis.overdue} overdue` : ""}`;
}

/** The view state the list is rendering under — never omitted from a payload. */
export interface TaskListView {
  groupBy?: string;
  smartView?: string | null;
  projectName?: string | null;
  searchQuery?: string | null;
  showCompleted?: boolean;
}

export function taskListHuman(
  tasks: TaskWithProject[],
  view: TaskListView = {},
): string {
  const kpis = taskListKpis(tasks);
  const head = [
    taskKpiLine(kpis),
    view.smartView ? `View: ${view.smartView}` : null,
    view.projectName ? `Project: ${view.projectName}` : null,
    view.groupBy && view.groupBy !== "none"
      ? `Grouped by ${view.groupBy}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [head, "", ...tasks.map(taskSummary)].join("\n\n");
}

export function buildTaskListPayload(input: {
  tasks: TaskWithProject[];
  view?: TaskListView;
  /** Grouping as rendered, when the pane is grouped. */
  groups?: Array<{ key: string; label: string; taskIds: string[] }>;
}): AgentPayloadInput {
  const { tasks, view = {}, groups } = input;
  const kpis = taskListKpis(tasks);
  return {
    kind: "tasks-list",
    location: TASKS_LOCATION,
    description:
      "The task list as rendered — every task in the current view, with the filters and grouping that produced it.",
    data: {
      tasks: tasks.map(taskRow),
      counts: kpis,
      ...(groups ? { groups } : {}),
    },
    summary: taskListHuman(tasks, view),
    attributes: {
      rows: kpis.total,
      open: kpis.open,
      completed: kpis.completed,
      overdue: kpis.overdue,
    },
    context: {
      smart_view: view.smartView ?? undefined,
      project: view.projectName ?? undefined,
      group_by: view.groupBy ?? undefined,
      search_query: view.searchQuery || undefined,
      show_completed: view.showCompleted,
      note: "These are the tasks the current filters produce — the same set on screen, not the whole workspace.",
    },
  };
}

export function buildTaskRowPayload(input: {
  task: TaskWithProject;
  kpis: TaskListKpis;
  view?: TaskListView;
}): AgentPayloadInput {
  const { task, kpis, view = {} } = input;
  return {
    kind: "task",
    location: TASKS_LOCATION,
    description: "One task row from the task list.",
    data: taskRow(task),
    summary: taskSummary(task),
    attributes: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate || undefined,
      subtasks: task.subtasks?.length ?? 0,
    },
    context: {
      list_total: kpis.total,
      list_open: kpis.open,
      list_overdue: kpis.overdue,
      smart_view: view.smartView ?? undefined,
      project: view.projectName ?? undefined,
    },
  };
}

// ── The open editor — LIVE state ───────────────────────────────────────────

/** The editor's draft overlay — `useTaskEditorController().effective`. */
export interface TaskEditorEffective {
  title: string;
  description: string;
  dueDate: string | null;
  priority: string | null;
  projectId: string | null;
  assigneeId: string | null;
  labels: string[];
  status: string;
  startDate: string | null;
  recurrenceRule: string | null;
}

/** The saved record the draft sits on top of. Loosely typed on purpose — the
 *  editor reads the agent-context task row, not the list's TaskWithProject. */
export interface TaskEditorSaved {
  id: string;
  title?: string | null;
  description?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  priority?: string | null;
  status?: string | null;
  project_id?: string | null;
  assignee_id?: string | null;
  recurrence_rule?: string | null;
  settings?: unknown;
  [key: string]: unknown;
}

export interface TaskEditorCopyInput {
  taskId: string;
  effective: TaskEditorEffective;
  saved: TaskEditorSaved | null | undefined;
  isDirty: boolean;
  projectName?: string | null;
  /** Subtasks as the editor's subtask rail renders them. */
  subtasks?: Array<{ id: string; title: string; status?: string | null }>;
}

function savedLabels(saved: TaskEditorSaved | null | undefined): string[] {
  const labels = (saved?.settings as { labels?: string[] } | null)?.labels;
  return Array.isArray(labels) ? labels : [];
}

/**
 * Field-by-field diff of the draft against the saved record. Empty when the
 * editor is clean. This is the half a re-fetch can never produce.
 */
export function unsavedChanges(
  input: TaskEditorCopyInput,
): Record<string, { saved: unknown; current: unknown }> {
  const { effective, saved } = input;
  const pairs: Array<[string, unknown, unknown]> = [
    ["title", saved?.title ?? "", effective.title],
    ["description", saved?.description ?? "", effective.description],
    ["status", saved?.status ?? null, effective.status],
    ["priority", saved?.priority ?? null, effective.priority],
    ["due_date", saved?.due_date ?? null, effective.dueDate],
    ["start_date", saved?.start_date ?? null, effective.startDate],
    ["project_id", saved?.project_id ?? null, effective.projectId],
    ["assignee_id", saved?.assignee_id ?? null, effective.assigneeId],
    [
      "recurrence_rule",
      saved?.recurrence_rule ?? null,
      effective.recurrenceRule,
    ],
    ["labels", savedLabels(saved), effective.labels],
  ];
  const out: Record<string, { saved: unknown; current: unknown }> = {};
  for (const [key, before, after] of pairs) {
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
      out[key] = { saved: before ?? null, current: after ?? null };
    }
  }
  return out;
}

export function taskEditorHuman(input: TaskEditorCopyInput): string {
  const { effective, projectName, subtasks, isDirty } = input;
  const diff = unsavedChanges(input);
  const changed = Object.keys(diff);
  return [
    lines([
      ["Task", effective.title],
      ["Status", effective.status],
      ["Project", projectName],
      ["Priority", effective.priority],
      ["Due", effective.dueDate],
      ["Start", effective.startDate],
      ["Repeats", effective.recurrenceRule],
      ["Labels", effective.labels.join(", ")],
      ["Assignee", effective.assigneeId],
      ["Unsaved edits", isDirty && changed.length ? changed.join(", ") : null],
    ]),
    effective.description ? `\nDescription:\n${effective.description}` : "",
    subtasks?.length
      ? `\nSubtasks:\n${subtasks
          .map((s) => `- [${s.status === "completed" ? "x" : " "}] ${s.title}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The open task editor as the user sees it RIGHT NOW: the draft overlay, not
 * the saved row, plus an explicit diff of what has not been saved yet.
 */
export function buildTaskEditorPayload(
  input: TaskEditorCopyInput,
): AgentPayloadInput {
  const { taskId, effective, saved, isDirty, projectName, subtasks } = input;
  const diff = unsavedChanges(input);
  return {
    kind: "task-record",
    location: taskDetailLocation(taskId, effective.title),
    description:
      "The open task exactly as the editor renders it right now, including edits the user has not saved.",
    data: {
      task: {
        id: taskId,
        title: effective.title,
        description: effective.description,
        status: effective.status,
        priority: effective.priority,
        due_date: effective.dueDate,
        start_date: effective.startDate,
        recurrence_rule: effective.recurrenceRule,
        project_id: effective.projectId,
        project_name: projectName ?? null,
        assignee_id: effective.assigneeId,
        labels: effective.labels,
      },
      subtasks: subtasks ?? [],
      unsaved_changes: diff,
      saved_record: saved ?? null,
    },
    summary: taskEditorHuman(input),
    attributes: {
      id: taskId,
      title: effective.title,
      status: effective.status,
      priority: effective.priority,
      unsaved: isDirty,
      unsaved_fields: Object.keys(diff).join(",") || undefined,
      subtasks: subtasks?.length ?? 0,
    },
    context: {
      project: projectName ?? undefined,
      note: isDirty
        ? "The user has UNSAVED edits open; `task` is the current on-screen state and `unsaved_changes` diffs it against `saved_record`."
        : "No unsaved edits — the on-screen state matches the saved record.",
    },
  };
}

/**
 * The editor's AI menu. The default (plain click) is the live what-I-see
 * payload above; this adds the deep tree fetch — a genuinely different and
 * much larger payload — as a named variant rather than the default, and
 * rather than deleting the affordance that used to be the only one here.
 */
export function taskEditorVariants(input: {
  fullTree: () => Promise<AgentPayloadInput | string>;
}): AiVariant[] {
  return [
    {
      id: "full-tree",
      label: "Full task tree (fetched)",
      hint: "Subtasks, comments, attachments and linked notes — as SAVED",
      build: input.fullTree,
    },
  ];
}
