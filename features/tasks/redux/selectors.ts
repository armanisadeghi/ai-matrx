"use client";

import { createSelector } from "@reduxjs/toolkit";
import { selectAllProjects } from "@/features/agent-context/redux/projectsSlice";
import { selectAllTasks } from "@/features/agent-context/redux/tasksSlice";
import {
  makeSelectEntityIdsMatchingScopes,
  selectAllEntityScopeAssignmentsFlat,
} from "@/features/scopes/redux/selectors/tree";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import type { Task, TaskWithProject, Project, TaskSortConfig } from "../types";
import { sortTasks } from "../utils/taskSorting";
import { matchesSearch } from "@/utils/search-scoring";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  normalizeTaskStatus,
  isClosedStatus,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
} from "../constants/status";
import {
  SMART_VIEWS,
  SMART_VIEW_BY_KEY,
  buildSmartViewContext,
  type SmartViewKey,
} from "../constants/smartViews";
import {
  selectActiveProject,
  selectTaskUserStateMap,
  selectShowAllProjects,
  selectShowCompleted,
  selectSearchQuery,
  selectTaskFilter,
  selectSmartView,
  selectSortBy,
  selectSortOrder,
  selectGroupBy,
  selectFilterScopeIds,
  selectFilterScopeMatchAll,
} from "./taskUiSlice";
import type { TaskGroupBy } from "./taskUiSlice";

export const UNASSIGNED_PROJECT_ID = "__unassigned__";

/**
 * Derive the hierarchical Project[] UI shape from the normalized agent-context
 * slices that are hydrated once by `fetchFullContext()` / `useNavTree()`.
 * This is the single source of truth — no duplicate network fetches.
 *
 * Orphaned tasks (project_id === null) surface under a virtual "Unassigned"
 * bucket so the /tasks route always shows them.
 */
export const selectProjects = createSelector(
  [selectAllProjects, selectAllTasks],
  (projectRecords, taskRecords): Project[] => {
    if (projectRecords.length === 0 && taskRecords.length === 0) return [];

    const byProjectId = new Map<string | null, typeof taskRecords>();
    for (const t of taskRecords) {
      const key = t.project_id ?? null;
      const bucket = byProjectId.get(key);
      if (bucket) {
        bucket.push(t);
      } else {
        byProjectId.set(key, [t]);
      }
    }

    const toUiTask = (rec: (typeof taskRecords)[number]): Task => {
      const status = normalizeTaskStatus(rec.status);
      return {
        id: rec.id,
        title: rec.title,
        completed: status === "completed",
        status,
        description: rec.description ?? "",
        attachments: [],
        dueDate: rec.due_date ?? "",
        startDate: rec.start_date ?? null,
        completedAt: rec.completed_at ?? null,
        recurrenceRule: rec.recurrence_rule ?? null,
        priority: (rec.priority as Task["priority"]) ?? null,
        assigneeId: rec.assignee_id ?? null,
        parentTaskId: rec.parent_task_id ?? null,
        subtasks: [],
        updatedAt: rec.updated_at ?? null,
        userId: rec.created_by ?? null,
        isPublic: rec.visibility === "public",
        origin: (rec.origin as Task["origin"]) ?? "user",
        sourceType: rec.source_type ?? null,
        sourceUrl: rec.source_url ?? null,
        sourceLabel: rec.source_label ?? null,
        settings: ((rec.settings as { labels?: string[] } | undefined) ??
          {}) as Task["settings"],
      };
    };

    const buildNested = (tasks: typeof taskRecords): Task[] => {
      const map = new Map<string, Task>();
      const roots: Task[] = [];
      for (const t of tasks) map.set(t.id, toUiTask(t));
      for (const t of tasks) {
        const node = map.get(t.id);
        if (!node) continue;
        const parent = t.parent_task_id
          ? map.get(t.parent_task_id)
          : undefined;
        if (parent) {
          parent.subtasks = [...(parent.subtasks ?? []), node];
        } else {
          roots.push(node);
        }
      }
      return roots;
    };

    const projects: Project[] = projectRecords
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        id: p.id,
        name: p.name,
        tasks: buildNested(byProjectId.get(p.id) ?? []),
      }));

    const orphans = byProjectId.get(null);
    if (orphans && orphans.length > 0) {
      projects.push({
        id: UNASSIGNED_PROJECT_ID,
        name: "Unassigned",
        tasks: buildNested(orphans),
      });
    }

    return projects;
  },
);

export const selectAllTasksFlat = createSelector(
  [selectProjects],
  (projects): TaskWithProject[] => {
    const out: TaskWithProject[] = [];
    for (const project of projects) {
      for (const task of project.tasks) {
        out.push({
          ...task,
          projectId: project.id,
          projectName: project.name,
        });
      }
    }
    return out;
  },
);

const selectEntityIdsMatchingScopes = makeSelectEntityIdsMatchingScopes();

export const selectTaskIdsMatchingScopeFilter = createSelector(
  [
    (state: import("@/lib/redux/rootReducer").RootState) => state,
    selectFilterScopeIds,
    selectFilterScopeMatchAll,
  ],
  (state, scopeIds, matchAll): string[] | null => {
    if (scopeIds.length === 0) return null;
    return selectEntityIdsMatchingScopes(state, {
      entityType: "task",
      scopeIds,
      matchAll,
    });
  },
);

/**
 * Task IDs matching the *app-context* scope selections (the "set context"
 * picker in the sidebar). Returns null when no scope is selected.
 *
 * AND across scope TYPES — `scope_selections` is keyed by type id with at
 * most one scope value per type, so a task must have every selected scope
 * (one per type) to match. This matches the user's intent: "Client=ACME
 * AND Department=SEO" should narrow to the intersection.
 */
export const selectTaskIdsMatchingAppContextScopes = createSelector(
  [
    (state: import("@/lib/redux/rootReducer").RootState) => state,
    selectScopeSelectionsContext,
  ],
  (state, scopeSelections): string[] | null => {
    const ids = Object.values(scopeSelections).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (ids.length === 0) return null;
    return selectEntityIdsMatchingScopes(state, {
      entityType: "task",
      scopeIds: ids,
      matchAll: true,
    });
  },
);

/**
 * Project IDs that remain valid under the current org + scope selections.
 * Returns null when no filter is active (all projects valid).
 *
 * Uses `scope_tags` already on `ProjectRecord` — no extra fetch needed.
 * AND semantics across scope types.
 */
export const selectValidProjectIds = createSelector(
  [selectAllProjects, selectOrganizationId, selectScopeSelectionsContext],
  (projects, orgId, scopeSelections): Set<string> | null => {
    const selectedScopeIds = Object.values(scopeSelections).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (!orgId && selectedScopeIds.length === 0) return null;

    const valid = new Set<string>();
    for (const p of projects) {
      if (orgId && p.organization_id !== orgId) continue;
      if (selectedScopeIds.length > 0) {
        const tagSet = new Set(p.scope_tags.map((t) => t.scope_id));
        const matchesAll = selectedScopeIds.every((id) => tagSet.has(id));
        if (!matchesAll) continue;
      }
      valid.add(p.id);
    }
    return valid;
  },
);

/**
 * Master filtered + sorted task list for /tasks.
 * Composes view scope → search → hide-completed → status filter →
 * legacy scope filter → app-context scopes → org → sort.
 */
export const selectFilteredTasks = createSelector(
  [
    selectProjects,
    selectAllTasks,
    selectShowAllProjects,
    selectActiveProject,
    selectSearchQuery,
    selectShowCompleted,
    selectTaskFilter,
    selectSmartView,
    selectUserId,
    selectSortBy,
    selectSortOrder,
    selectTaskIdsMatchingScopeFilter,
    selectTaskIdsMatchingAppContextScopes,
    selectOrganizationId,
    selectValidProjectIds,
    selectTaskUserStateMap,
  ],
  (
    projects,
    allTaskRecords,
    showAllProjects,
    activeProject,
    searchQuery,
    showCompleted,
    filter,
    smartView,
    currentUserId,
    sortBy,
    sortOrder,
    scopeTaskIds,
    appContextScopeTaskIds,
    appOrgId,
    validProjectIdsForTaskPipe,
    userStateMap,
  ): TaskWithProject[] => {
    // Local-date string — toISOString() would shift UTC+ users to yesterday.
    const todayStr = new Date().toLocaleDateString("sv-SE");

    let tasks: TaskWithProject[] = [];

    if (showAllProjects) {
      for (const project of projects) {
        for (const task of project.tasks) {
          tasks.push({
            ...task,
            projectId: project.id,
            projectName: project.name,
          });
        }
      }
    } else if (activeProject !== null) {
      const p = projects.find((pp) => pp.id === activeProject);
      if (p) {
        for (const task of p.tasks) {
          tasks.push({
            ...task,
            projectId: p.id,
            projectName: p.name,
          });
        }
      }
    }

    if (searchQuery.trim()) {
      tasks = tasks.filter((t) =>
        matchesSearch(t, searchQuery, [
          { get: (x) => x.title, weight: "title" },
          { get: (x) => x.projectName, weight: "subtitle" },
          { get: (x) => x.description, weight: "body" },
        ]),
      );
    }

    // Smart view (Inbox/Today/Upcoming/Overdue/Assigned to me/…) — the
    // registry in constants/smartViews.ts is the single definition.
    const view = SMART_VIEW_BY_KEY[smartView] ?? SMART_VIEW_BY_KEY.all;
    const viewCtx = buildSmartViewContext(currentUserId);
    if (!view.includesClosed && !showCompleted) {
      // Closed tasks (completed/cancelled/dismissed) hidden by default.
      tasks = tasks.filter((t) => !isClosedStatus(t.status));
    }
    if (view.key !== "all") {
      tasks = tasks.filter((t) => view.predicate(t, viewCtx));
    }
    // Snoozed tasks disappear from the attention views (everything except
    // All tasks / Completed) until their snooze expires.
    if (view.key !== "all" && view.key !== "completed") {
      const nowIso = new Date().toISOString();
      tasks = tasks.filter((t) => {
        const snoozedUntil = userStateMap[t.id]?.snoozedUntil;
        return !snoozedUntil || snoozedUntil <= nowIso;
      });
    }

    switch (filter) {
      case "incomplete":
        tasks = tasks.filter((t) => !t.completed);
        break;
      case "overdue":
        tasks = tasks.filter(
          (t) => !t.completed && t.dueDate && t.dueDate < todayStr,
        );
        break;
      default:
        break;
    }

    if (scopeTaskIds !== null) {
      const allowed = new Set(scopeTaskIds);
      tasks = tasks.filter((t) => allowed.has(t.id));
    }

    if (appOrgId) {
      const byId = new Map(allTaskRecords.map((r) => [r.id, r] as const));
      tasks = tasks.filter((t) => {
        const rec = byId.get(t.id);
        return rec ? rec.organization_id === appOrgId : true;
      });
    }

    // When app-context scopes are selected, a task is visible if EITHER:
    //   - the task itself is tagged with the matching scope(s), OR
    //   - the task's project is tagged with them (inherit from project).
    // This matches the natural mental model: "show me ACME's work"
    // should include ACME-tagged tasks AND all tasks within ACME projects,
    // even untagged ones.
    if (appContextScopeTaskIds !== null) {
      const directTask = new Set(appContextScopeTaskIds);
      const validProjIds = validProjectIdsForTaskPipe;
      tasks = tasks.filter(
        (t) =>
          directTask.has(t.id) ||
          (t.projectId && validProjIds?.has(t.projectId)),
      );
    }

    const sortConfig: TaskSortConfig = {
      primarySort: sortBy,
      direction: "asc",
    };
    const sorted = sortTasks(tasks, sortConfig);
    const directed = sortOrder === "asc" ? sorted.reverse() : sorted;
    // Pinned tasks float to the top within the current ordering.
    const pinned: TaskWithProject[] = [];
    const rest: TaskWithProject[] = [];
    for (const t of directed) {
      (userStateMap[t.id]?.pinnedAt ? pinned : rest).push(t);
    }
    return pinned.length ? [...pinned, ...rest] : directed;
  },
);

/**
 * Tasks grouped by the currently-selected `groupBy` mode.
 * Keys are group labels (project name, scope label, priority, etc.);
 * values are the sorted task lists. Returns in the insertion order the UI
 * should render (unassigned/none last).
 */
export const selectGroupedFilteredTasks = createSelector(
  [
    selectFilteredTasks,
    selectGroupBy,
    selectAllEntityScopeAssignmentsFlat,
    selectAllProjects,
  ],
  (tasks, groupBy, assignments, projectRecords) => {
    const groups: { key: string; label: string; tasks: TaskWithProject[] }[] =
      [];

    if (groupBy === "none") {
      groups.push({ key: "all", label: "All Tasks", tasks });
      return groups;
    }

    const push = (key: string, label: string, task: TaskWithProject) => {
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, label, tasks: [] };
        groups.push(g);
      }
      g.tasks.push(task);
    };

    if (groupBy === "project") {
      const nameById = new Map(projectRecords.map((p) => [p.id, p.name]));
      for (const t of tasks) {
        const key = t.projectId ?? "__none__";
        const label =
          nameById.get(t.projectId) ?? t.projectName ?? "Unassigned";
        push(key, label, t);
      }
    } else if (groupBy === "scope") {
      // Use assignments to map each task id -> set of scope ids; render one
      // group per scope it belongs to. Tasks with no scope fall into "Unassigned".
      const taskToScopes = new Map<string, string[]>();
      for (const a of assignments) {
        if (a.entity_type !== "task") continue;
        const arr = taskToScopes.get(a.entity_id) ?? [];
        arr.push(a.scope_id);
        taskToScopes.set(a.entity_id, arr);
      }
      for (const t of tasks) {
        const scopeIds = taskToScopes.get(t.id);
        if (!scopeIds || scopeIds.length === 0) {
          push("__none__", "Unassigned", t);
        } else {
          for (const scopeId of scopeIds) {
            push(scopeId, scopeId, t); // label resolved in UI via scope slice
          }
        }
      }
    } else if (groupBy === "priority") {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const labelFor = (p: string | null | undefined) => {
        if (p === "high") return "High";
        if (p === "medium") return "Medium";
        if (p === "low") return "Low";
        return "No priority";
      };
      for (const t of tasks) {
        const key = t.priority ?? "__none__";
        push(String(key), labelFor(t.priority), t);
      }
      groups.sort((a, b) => {
        const ao = order[a.key] ?? 99;
        const bo = order[b.key] ?? 99;
        return ao - bo;
      });
    } else if (groupBy === "status") {
      for (const t of tasks) {
        const status = normalizeTaskStatus(t.status);
        push(status, TASK_STATUS_META[status].label, t);
      }
      groups.sort(
        (a, b) =>
          (TASK_STATUS_ORDER[a.key as keyof typeof TASK_STATUS_ORDER] ?? 99) -
          (TASK_STATUS_ORDER[b.key as keyof typeof TASK_STATUS_ORDER] ?? 99),
      );
    } else if (groupBy === "dueDate") {
      const todayStr = new Date().toLocaleDateString("sv-SE");
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const in7Str = in7.toLocaleDateString("sv-SE");
      for (const t of tasks) {
        let key = "nodate";
        let label = "No due date";
        if (t.dueDate) {
          if (t.dueDate < todayStr) {
            key = "overdue";
            label = "Overdue";
          } else if (t.dueDate === todayStr) {
            key = "today";
            label = "Today";
          } else if (t.dueDate <= in7Str) {
            key = "thisweek";
            label = "This week";
          } else {
            key = "later";
            label = "Later";
          }
        }
        push(key, label, t);
      }
      const orderMap: Record<string, number> = {
        overdue: 0,
        today: 1,
        thisweek: 2,
        later: 3,
        nodate: 4,
      };
      groups.sort((a, b) => (orderMap[a.key] ?? 99) - (orderMap[b.key] ?? 99));
    }

    // Move "__none__" / "No * " / "Unassigned" to the end
    groups.sort((a, b) => {
      const aLast = a.key === "__none__" ? 1 : 0;
      const bLast = b.key === "__none__" ? 1 : 0;
      return aLast - bLast;
    });

    return groups;
  },
);

/**
 * Per-smart-view task counts for the sidebar badges — "what you'd see if you
 * clicked it": org-context-scoped and snooze-aware, over all projects.
 * (Search and the active-project drill-down are deliberately ignored so the
 * badges stay stable while typing/drilling.)
 */
export const selectSmartViewCounts = createSelector(
  [
    selectAllTasksFlat,
    selectAllTasks,
    selectUserId,
    selectOrganizationId,
    selectTaskUserStateMap,
  ],
  (
    tasks,
    allTaskRecords,
    currentUserId,
    appOrgId,
    userStateMap,
  ): Record<SmartViewKey, number> => {
    const ctx = buildSmartViewContext(currentUserId);
    const nowIso = new Date().toISOString();
    // Respect the active org context so counts always agree with the list.
    let scoped = tasks;
    if (appOrgId) {
      const byId = new Map(allTaskRecords.map((r) => [r.id, r] as const));
      scoped = tasks.filter((t) => {
        const rec = byId.get(t.id);
        return rec ? rec.organization_id === appOrgId : true;
      });
    }
    const counts = {} as Record<SmartViewKey, number>;
    for (const view of SMART_VIEWS) {
      let n = 0;
      for (const t of scoped) {
        if (!view.includesClosed && isClosedStatus(t.status)) continue;
        if (view.key !== "all" && !view.predicate(t, ctx)) continue;
        if (view.key !== "all" && view.key !== "completed") {
          const snoozedUntil = userStateMap[t.id]?.snoozedUntil;
          if (snoozedUntil && snoozedUntil > nowIso) continue;
        }
        n += 1;
      }
      counts[view.key] = n;
    }
    return counts;
  },
);
