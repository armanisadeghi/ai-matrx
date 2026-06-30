"use client";

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { DatabaseTask, ProjectWithTasks } from "../types/database";
import type { TaskFilterType } from "../types";
import type { TaskSortField } from "../types/sort";

export interface TaskUiState {
  // Hierarchical data (source of truth for the tasks route UI)
  projectsWithTasks: ProjectWithTasks[];
  sharedTasks: DatabaseTask[];

  // Lifecycle
  loading: boolean;
  initialized: boolean;
  isCreatingProject: boolean;
  isCreatingTask: boolean;
  operatingTaskId: string | null;
  operatingProjectId: string | null;

  // Sidebar / view state
  activeProject: string | null;
  expandedProjects: string[];
  expandedTasks: string[];
  filter: TaskFilterType;
  showAllProjects: boolean;
  showCompleted: boolean;
  searchQuery: string;
  sortBy: TaskSortField;
  newProjectName: string;
  newTaskTitle: string;

  // Scope filter (sidebar) — view-only, does not write to any entity
  filterScopeIds: string[];
  filterScopeMatchAll: boolean;

  // List grouping + sort direction
  groupBy: TaskGroupBy;
  sortOrder: "asc" | "desc";

  // Currently selected task in the middle pane (opens in main editor)
  selectedTaskId: string | null;

  // Per-task edit drafts. Only fields that diverge from the server live here;
  // presence of a non-empty entry === dirty.
  taskEdits: Record<string, TaskEditDraft>;

  // Post-create handoff (for non-blocking "Edit details" banner)
  lastCreatedTaskId: string | null;

  // Transient "source" for widgets that are about to create or link a task
  // from some other entity (chat message, note, file, chat block, ...)
  pendingSource: PendingSource | null;
}

export interface PendingSource {
  // Null when the captured content has no registered entity row (raw content,
  // retired prompt-result, scraper-result) → the task is created with NO edge.
  // Never a phantom token.
  entity_type: string | null;
  entity_id: string | null;
  label?: string;
  metadata?: Record<string, unknown>;
  prePopulate?: {
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  };
}

export type TaskGroupBy =
  "project" | "scope" | "priority" | "status" | "dueDate" | "none";

export interface TaskEditDraft {
  title?: string;
  description?: string;
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  project_id?: string | null;
  assignee_id?: string | null;
  labels?: string[];
}

const initialState: TaskUiState = {
  projectsWithTasks: [],
  sharedTasks: [],

  loading: false,
  initialized: false,
  isCreatingProject: false,
  isCreatingTask: false,
  operatingTaskId: null,
  operatingProjectId: null,

  activeProject: null,
  expandedProjects: [],
  expandedTasks: [],
  filter: "all",
  showAllProjects: true,
  showCompleted: false,
  searchQuery: "",
  sortBy: "lastUpdated",
  newProjectName: "",
  newTaskTitle: "",

  filterScopeIds: [],
  filterScopeMatchAll: false,

  groupBy: "project",
  sortOrder: "desc",
  selectedTaskId: null,
  taskEdits: {},

  lastCreatedTaskId: null,
  pendingSource: null,
};

const slice = createSlice({
  name: "tasksUi",
  initialState,
  reducers: {
    // ─── Data hydration ─────────────────────────────────────────────────────
    setProjectsWithTasks(state, action: PayloadAction<ProjectWithTasks[]>) {
      state.projectsWithTasks = action.payload;
    },
    setSharedTasks(state, action: PayloadAction<DatabaseTask[]>) {
      state.sharedTasks = action.payload;
    },

    // Optimistic helpers for in-place mutation
    upsertTaskInProject(
      state,
      action: PayloadAction<{ projectId: string; task: DatabaseTask }>,
    ) {
      const { projectId, task } = action.payload;
      const proj = state.projectsWithTasks.find((p) => p.id === projectId);
      if (!proj) return;
      const tasks = (proj.tasks ?? []) as DatabaseTask[];
      const idx = tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) tasks[idx] = task;
      else tasks.push(task);
      proj.tasks = tasks;
    },
    replaceTaskId(
      state,
      action: PayloadAction<{ tempId: string; newTask: DatabaseTask }>,
    ) {
      const { tempId, newTask } = action.payload;
      for (const proj of state.projectsWithTasks) {
        const tasks = (proj.tasks ?? []) as DatabaseTask[];
        const idx = tasks.findIndex((t) => t.id === tempId);
        if (idx >= 0) {
          tasks[idx] = newTask;
          return;
        }
      }
    },
    removeTaskFromProjects(state, action: PayloadAction<string>) {
      const taskId = action.payload;
      for (const proj of state.projectsWithTasks) {
        proj.tasks = ((proj.tasks ?? []) as DatabaseTask[]).filter(
          (t) => t.id !== taskId,
        );
      }
    },
    patchTaskInProjects(
      state,
      action: PayloadAction<{ taskId: string; patch: Partial<DatabaseTask> }>,
    ) {
      const { taskId, patch } = action.payload;
      for (const proj of state.projectsWithTasks) {
        const tasks = (proj.tasks ?? []) as DatabaseTask[];
        const idx = tasks.findIndex((t) => t.id === taskId);
        if (idx >= 0) {
          tasks[idx] = { ...tasks[idx], ...patch };
          return;
        }
      }
    },
    moveTaskBetweenProjects(
      state,
      action: PayloadAction<{
        taskId: string;
        fromProjectId: string;
        toProjectId: string | null;
      }>,
    ) {
      const { taskId, fromProjectId, toProjectId } = action.payload;
      const from = state.projectsWithTasks.find((p) => p.id === fromProjectId);
      if (!from) return;
      const tasks = (from.tasks ?? []) as DatabaseTask[];
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx < 0) return;
      const [task] = tasks.splice(idx, 1);
      from.tasks = tasks;
      if (toProjectId) {
        const to = state.projectsWithTasks.find((p) => p.id === toProjectId);
        if (to) {
          to.tasks = [
            ...((to.tasks ?? []) as DatabaseTask[]),
            {
              ...task,
              project_id: toProjectId,
            },
          ];
        }
      }
    },
    addProjectToList(state, action: PayloadAction<ProjectWithTasks>) {
      state.projectsWithTasks = [action.payload, ...state.projectsWithTasks];
    },
    patchProject(
      state,
      action: PayloadAction<{
        projectId: string;
        patch: Partial<ProjectWithTasks>;
      }>,
    ) {
      const { projectId, patch } = action.payload;
      const proj = state.projectsWithTasks.find((p) => p.id === projectId);
      if (proj) Object.assign(proj, patch);
    },
    removeProject(state, action: PayloadAction<string>) {
      state.projectsWithTasks = state.projectsWithTasks.filter(
        (p) => p.id !== action.payload,
      );
      if (state.activeProject === action.payload) state.activeProject = null;
    },

    // ─── Lifecycle ──────────────────────────────────────────────────────────
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setInitialized(state, action: PayloadAction<boolean>) {
      state.initialized = action.payload;
    },
    setIsCreatingProject(state, action: PayloadAction<boolean>) {
      state.isCreatingProject = action.payload;
    },
    setIsCreatingTask(state, action: PayloadAction<boolean>) {
      state.isCreatingTask = action.payload;
    },
    setOperatingTaskId(state, action: PayloadAction<string | null>) {
      state.operatingTaskId = action.payload;
    },
    setOperatingProjectId(state, action: PayloadAction<string | null>) {
      state.operatingProjectId = action.payload;
    },

    // ─── View state ─────────────────────────────────────────────────────────
    setActiveProject(state, action: PayloadAction<string | null>) {
      state.activeProject = action.payload;
    },
    toggleProjectExpand(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.expandedProjects = state.expandedProjects.includes(id)
        ? state.expandedProjects.filter((p) => p !== id)
        : [...state.expandedProjects, id];
    },
    setExpandedProjects(state, action: PayloadAction<string[]>) {
      state.expandedProjects = action.payload;
    },
    toggleTaskExpand(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.expandedTasks = state.expandedTasks.includes(id)
        ? state.expandedTasks.filter((t) => t !== id)
        : [...state.expandedTasks, id];
    },
    setFilter(state, action: PayloadAction<TaskFilterType>) {
      state.filter = action.payload;
    },
    setShowAllProjects(state, action: PayloadAction<boolean>) {
      state.showAllProjects = action.payload;
    },
    setShowCompleted(state, action: PayloadAction<boolean>) {
      state.showCompleted = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setSortBy(state, action: PayloadAction<TaskSortField>) {
      state.sortBy = action.payload;
    },
    setNewProjectName(state, action: PayloadAction<string>) {
      state.newProjectName = action.payload;
    },
    setNewTaskTitle(state, action: PayloadAction<string>) {
      state.newTaskTitle = action.payload;
    },

    // ─── Scope filter ───────────────────────────────────────────────────────
    setFilterScopeIds(state, action: PayloadAction<string[]>) {
      state.filterScopeIds = action.payload;
    },
    toggleFilterScopeId(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.filterScopeIds = state.filterScopeIds.includes(id)
        ? state.filterScopeIds.filter((s) => s !== id)
        : [...state.filterScopeIds, id];
    },
    clearFilterScopes(state) {
      state.filterScopeIds = [];
    },
    setFilterScopeMatchAll(state, action: PayloadAction<boolean>) {
      state.filterScopeMatchAll = action.payload;
    },

    // ─── Group / sort direction ─────────────────────────────────────────────
    setGroupBy(state, action: PayloadAction<TaskGroupBy>) {
      state.groupBy = action.payload;
    },
    setSortOrder(state, action: PayloadAction<"asc" | "desc">) {
      state.sortOrder = action.payload;
    },
    toggleSortOrder(state) {
      state.sortOrder = state.sortOrder === "desc" ? "asc" : "desc";
    },

    // ─── Selected task (opens in main editor) ───────────────────────────────
    setSelectedTaskId(state, action: PayloadAction<string | null>) {
      state.selectedTaskId = action.payload;
    },

    // ─── Task editor draft (for isDirty tracking + save) ────────────────────
    patchTaskEdit(
      state,
      action: PayloadAction<{ taskId: string; patch: TaskEditDraft }>,
    ) {
      const { taskId, patch } = action.payload;
      const current = state.taskEdits[taskId] ?? {};
      const next: TaskEditDraft = { ...current };
      for (const [k, v] of Object.entries(patch) as [
        keyof TaskEditDraft,
        TaskEditDraft[keyof TaskEditDraft],
      ][]) {
        // @ts-expect-error — keyof narrowing across union
        next[k] = v;
      }
      state.taskEdits[taskId] = next;
    },
    clearTaskEdit(state, action: PayloadAction<string>) {
      delete state.taskEdits[action.payload];
    },
    clearAllTaskEdits(state) {
      state.taskEdits = {};
    },

    // ─── Post-create ────────────────────────────────────────────────────────
    setLastCreatedTaskId(state, action: PayloadAction<string | null>) {
      state.lastCreatedTaskId = action.payload;
    },

    // ─── Pending source (for "associate from X" widgets) ───────────────────
    setPendingSource(state, action: PayloadAction<PendingSource | null>) {
      state.pendingSource = action.payload;
    },
    clearPendingSource(state) {
      state.pendingSource = null;
    },
  },
});

export const {
  setProjectsWithTasks,
  setSharedTasks,
  upsertTaskInProject,
  replaceTaskId,
  removeTaskFromProjects,
  patchTaskInProjects,
  moveTaskBetweenProjects,
  addProjectToList,
  patchProject,
  removeProject,
  setLoading,
  setInitialized,
  setIsCreatingProject,
  setIsCreatingTask,
  setOperatingTaskId,
  setOperatingProjectId,
  setActiveProject,
  toggleProjectExpand,
  setExpandedProjects,
  toggleTaskExpand,
  setFilter,
  setShowAllProjects,
  setShowCompleted,
  setSearchQuery,
  setSortBy,
  setNewProjectName,
  setNewTaskTitle,
  setFilterScopeIds,
  toggleFilterScopeId,
  clearFilterScopes,
  setFilterScopeMatchAll,
  setGroupBy,
  setSortOrder,
  toggleSortOrder,
  setSelectedTaskId,
  patchTaskEdit,
  clearTaskEdit,
  clearAllTaskEdits,
  setLastCreatedTaskId,
  setPendingSource,
  clearPendingSource,
} = slice.actions;

export default slice.reducer;

// ─── Selectors ─────────────────────────────────────────────────────────────

type StateWithTasksUi = { tasksUi: TaskUiState };

export const selectTaskUi = (s: StateWithTasksUi) => s.tasksUi;
export const selectProjectsWithTasks = (s: StateWithTasksUi) =>
  s.tasksUi.projectsWithTasks;
export const selectSharedTasks = (s: StateWithTasksUi) => s.tasksUi.sharedTasks;
export const selectTasksLoading = (s: StateWithTasksUi) => s.tasksUi.loading;
export const selectTasksInitialized = (s: StateWithTasksUi) =>
  s.tasksUi.initialized;
export const selectIsCreatingProject = (s: StateWithTasksUi) =>
  s.tasksUi.isCreatingProject;
export const selectIsCreatingTask = (s: StateWithTasksUi) =>
  s.tasksUi.isCreatingTask;
export const selectOperatingTaskId = (s: StateWithTasksUi) =>
  s.tasksUi.operatingTaskId;
export const selectOperatingProjectId = (s: StateWithTasksUi) =>
  s.tasksUi.operatingProjectId;
export const selectActiveProject = (s: StateWithTasksUi) =>
  s.tasksUi.activeProject;
export const selectExpandedProjects = (s: StateWithTasksUi) =>
  s.tasksUi.expandedProjects;
export const selectExpandedTasks = (s: StateWithTasksUi) =>
  s.tasksUi.expandedTasks;
export const selectTaskFilter = (s: StateWithTasksUi) => s.tasksUi.filter;
export const selectShowAllProjects = (s: StateWithTasksUi) =>
  s.tasksUi.showAllProjects;
export const selectShowCompleted = (s: StateWithTasksUi) =>
  s.tasksUi.showCompleted;
export const selectSearchQuery = (s: StateWithTasksUi) => s.tasksUi.searchQuery;
export const selectSortBy = (s: StateWithTasksUi) => s.tasksUi.sortBy;
export const selectNewProjectName = (s: StateWithTasksUi) =>
  s.tasksUi.newProjectName;
export const selectNewTaskTitle = (s: StateWithTasksUi) =>
  s.tasksUi.newTaskTitle;
export const selectFilterScopeIds = (s: StateWithTasksUi) =>
  s.tasksUi.filterScopeIds;
export const selectFilterScopeMatchAll = (s: StateWithTasksUi) =>
  s.tasksUi.filterScopeMatchAll;
export const selectLastCreatedTaskId = (s: StateWithTasksUi) =>
  s.tasksUi.lastCreatedTaskId;
export const selectGroupBy = (s: StateWithTasksUi) => s.tasksUi.groupBy;
export const selectSortOrder = (s: StateWithTasksUi) => s.tasksUi.sortOrder;
export const selectSelectedTaskId = (s: StateWithTasksUi) =>
  s.tasksUi.selectedTaskId;
export const selectTaskEdits = (s: StateWithTasksUi) => s.tasksUi.taskEdits;

const EMPTY_DRAFT: TaskEditDraft = Object.freeze({});
export const selectTaskEdit =
  (taskId: string) =>
  (s: StateWithTasksUi): TaskEditDraft =>
    s.tasksUi.taskEdits[taskId] ?? EMPTY_DRAFT;

export const selectTaskIsDirty =
  (taskId: string) =>
  (s: StateWithTasksUi): boolean => {
    const draft = s.tasksUi.taskEdits[taskId];
    return !!draft && Object.keys(draft).length > 0;
  };
export const selectPendingSource = (s: StateWithTasksUi) =>
  s.tasksUi.pendingSource;
