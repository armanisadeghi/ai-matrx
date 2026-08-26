"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  CircleDashed,
  CheckCircle2,
  Copy,
  Folder,
  LayoutGrid,
  List,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectGroupedFilteredTasks,
  selectProjects,
} from "@/features/tasks/redux/selectors";
import {
  selectSelectedTaskId,
  selectIsCreatingTask,
  selectNewTaskTitle,
  selectActiveProject,
  selectTasksLoading,
  selectGroupBy,
  selectSmartView,
  selectSearchQuery,
  selectShowCompleted,
  setSelectedTaskId,
  setNewTaskTitle,
} from "@/features/tasks/redux/taskUiSlice";
import { getTaskGroupByBanner } from "@/features/tasks/constants/groupBy";
import { makeSelectScopeNameMapForOrg } from "@/features/scopes/redux/selectors/tree";
import {
  createTaskThunk,
  deleteTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { cn } from "@/utils/cn";
import type { TaskWithProject } from "@/features/tasks/types";
import TasksTableView from "@/features/tasks/components/TasksTableView";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { formatDateOnly } from "@/utils/dateOnly";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  buildTaskListPayload,
  buildTaskRowPayload,
  taskCsvRows,
  taskListHuman,
  taskListKpis,
  taskRow,
  taskSummary,
  type TaskListKpis,
  type TaskListView,
} from "@/features/tasks/lib/copy";
import {
  useListViewPrefs,
  type LegacyListViewImport,
} from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  TASKS_CONTEXT_MENU_PROPS,
  buildTasksListContextData,
  createTasksExtraSections,
} from "@/features/tasks/agent-context/buildTasksContextData";

/** DOM anchor the delegated menu reads to find the right-clicked row —
 * mirrors the pattern in `features/user-lists/dom-anchors.ts`. */
const TASK_ROW_DOM_ATTR = "data-task-row-id";

/**
 * Style prefs for this pane (synced across devices via `userPreferences`).
 * The grouped task list is the canonical `rows` view; table is the alternate.
 */
const TASK_LIST_VIEW_DEFAULTS: Partial<ListViewPrefs> = { view: "rows" };

/**
 * One-time adoption of the device-local key. Note the vocabulary change: this
 * pane called its non-table mode "list", which is `rows` on the shared axes —
 * a raw pass-through would have written a value no toggle here matches.
 */
const TASK_LIST_LEGACY_VIEW: LegacyListViewImport = {
  key: "tasks-list-view",
  map: (raw) => {
    if (raw === "table") return { view: "table" };
    if (raw === "list") return { view: "rows" };
    return null;
  },
};

export default function TaskListPane() {
  const dispatch = useAppDispatch();
  const groups = useAppSelector(selectGroupedFilteredTasks);
  const selectedTaskId = useAppSelector(selectSelectedTaskId);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const {
    inputRef: quickAddInputRef,
    scheduleRefocus: scheduleQuickAddRefocus,
  } = useRefocusInputAfterAsync(isCreatingTask);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const activeProject = useAppSelector(selectActiveProject);
  const projects = useAppSelector(selectProjects);
  const loading = useAppSelector(selectTasksLoading);
  const groupBy = useAppSelector(selectGroupBy);
  const smartView = useAppSelector(selectSmartView);
  const searchQuery = useAppSelector(selectSearchQuery);
  const showCompleted = useAppSelector(selectShowCompleted);
  const groupByBanner = getTaskGroupByBanner(groupBy);
  const isGrouped = groupBy !== "none";
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const selectScopeNameMapForOrg = useMemo(
    () => makeSelectScopeNameMapForOrg(),
    [],
  );
  const scopeNameMap = useAppSelector((state) =>
    selectScopeNameMapForOrg(state, orgId),
  );

  const { prefs, setView } = useListViewPrefs(
    "tasks-list-pane",
    TASK_LIST_VIEW_DEFAULTS,
    TASK_LIST_LEGACY_VIEW,
  );
  const isTableView = prefs.view === "table";

  const activeGroupKey = useMemo(() => {
    if (!selectedTaskId) return null;
    for (const group of groups) {
      if (group.tasks.some((task) => task.id === selectedTaskId)) {
        return group.key;
      }
    }
    return null;
  }, [groups, selectedTaskId]);

  const defaultCollapsed = useMemo(() => {
    const next = new Set(groups.map((group) => group.key));
    if (activeGroupKey) next.delete(activeGroupKey);
    return next;
  }, [groups, activeGroupKey]);

  const collapseStateKey = `${selectedTaskId ?? "none"}:${groupBy}`;
  const [collapsedOverride, setCollapsedOverride] = useState<{
    key: string;
    groups: Set<string>;
  }>();

  const collapsed =
    collapsedOverride?.key === collapseStateKey
      ? collapsedOverride.groups
      : defaultCollapsed;

  const totalCount = groups.reduce((sum, g) => sum + g.tasks.length, 0);

  // Copy/export cover every task the current view produces — ALL groups
  // flattened, never the expanded ones only, and never a collapsed group's
  // rows silently dropped.
  const allVisibleTasks = groups.flatMap((g) => g.tasks);
  const listKpis = taskListKpis(allVisibleTasks);
  const activeProjectName =
    activeProject && activeProject !== "__unassigned__"
      ? (projects.find((p) => p.id === activeProject)?.name ?? null)
      : null;
  const listView: TaskListView = {
    groupBy,
    smartView: typeof smartView === "string" ? smartView : null,
    projectName: activeProjectName,
    searchQuery: typeof searchQuery === "string" ? searchQuery : null,
    showCompleted: showCompleted === true,
  };

  const handleSelectTask = (taskId: string) => {
    dispatch(setSelectedTaskId(taskId));
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    const defaultScopeIds = Object.values(scopeSelections).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const firstProject =
      activeProject && activeProject !== "__unassigned__"
        ? activeProject
        : (projects.find((p) => p.id !== "__unassigned__")?.id ?? null);
    const newId = await dispatch(
      createTaskThunk({
        title: newTaskTitle,
        projectId: firstProject,
        organizationId: orgId,
        scopeIds: defaultScopeIds,
      }),
    ).unwrap();
    if (newId) {
      dispatch(setSelectedTaskId(newId));
      scheduleQuickAddRefocus();
    }
  };

  // ── The ONE context menu for this pane ──────────────────────────────────
  //
  // Single-instance delegation, same shape as `ListDetailClient`: one
  // `NonEditableContextMenu` wraps the whole scroll region and
  // `resolveContextOnOpen` reads the right-clicked row's `data-task-row-id`
  // off the DOM, so Complete/Reopen/Duplicate bind to the SAME thunks the
  // row's own controls already call — never a second action set (the sibling
  // `TaskEditorBody.tsx` owns the canonical `createTasksExtraSections`).
  const menuTargetRef = useRef<TaskWithProject | null>(null);
  const [menuTarget, setMenuTarget] = useState<TaskWithProject | null>(null);

  const findTaskById = (taskId: string): TaskWithProject | null =>
    allVisibleTasks.find((t) => t.id === taskId) ?? null;

  const resolveMenuTarget = (target: HTMLElement | null) => {
    const taskId =
      target?.closest?.(`[${TASK_ROW_DOM_ATTR}]`)?.getAttribute(
        TASK_ROW_DOM_ATTR,
      ) ?? null;
    const next = taskId ? findTaskById(taskId) : null;
    menuTargetRef.current = next;
    setMenuTarget(next);
    if (!next) return null;
    return {
      [CONTEXT_MENU_ENTITY_KEY]: {
        type: "task" as const,
        id: next.id,
        title: next.title || "Untitled task",
        resourceType: "task" as const,
      },
    };
  };

  const handleDuplicateTask = async (task: TaskWithProject) => {
    const newId = await dispatch(
      createTaskThunk({
        title: `${task.title} (copy)`,
        description: task.description ?? null,
        dueDate: task.dueDate ?? null,
        projectId:
          task.projectId && task.projectId !== "__unassigned__"
            ? task.projectId
            : null,
        priority: task.priority ?? null,
        organizationId: orgId,
      }),
    ).unwrap();
    if (newId) dispatch(setSelectedTaskId(newId));
  };

  const menuSections: ContextMenuExtraSection[] = menuTarget
    ? createTasksExtraSections({
        completed: menuTarget.completed,
        onToggleComplete: () =>
          dispatch(toggleTaskCompleteThunk({ taskId: menuTarget.id })),
        onDelete: () =>
          dispatch(
            deleteTaskThunk({
              taskId: menuTarget.id,
              projectId: menuTarget.projectId,
            }),
          ),
      }).map((section) => {
        // Same "task-ops" section `TaskEditorBody` defines — drop "Save"
        // (no editor buffer in the list pane) and add "Duplicate" right
        // after Complete/Reopen, ahead of the destructive Delete row.
        const withoutSave = section.items.filter(
          (item) => !("id" in item) || item.id !== "save",
        );
        const toggleIdx = withoutSave.findIndex(
          (item) => "id" in item && item.id === "toggle-complete",
        );
        const duplicateItem: ContextMenuExtraSection["items"][number] = {
          kind: "item",
          id: "duplicate",
          label: "Duplicate task",
          icon: Copy,
          onSelect: () => void handleDuplicateTask(menuTarget),
        };
        const items = [...withoutSave];
        items.splice(toggleIdx + 1, 0, duplicateItem);
        return { ...section, items };
      })
    : [];

  const getMenuApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection?.()?.toString() ?? "",
      selectionRange: null,
      contextData: buildTasksListContextData({
        tasks: allVisibleTasks,
        projects,
        searchQuery: typeof searchQuery === "string" ? searchQuery : "",
      }),
    });

  const toggleGroup = (key: string) => {
    setCollapsedOverride((prev) => {
      const base =
        prev?.key === collapseStateKey ? prev.groups : defaultCollapsed;
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { key: collapseStateKey, groups: next };
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Quick-add — title moved to the shell header (PageHeader). */}
      <div className="shrink-0 px-2 py-2 border-b border-border/40 bg-muted/20 flex items-center gap-2">
        <span
          className="text-[11px] text-muted-foreground tabular-nums shrink-0 pl-1"
          data-surface-value="task_count"
        >
          {totalCount}
        </span>
        <div className="flex items-center rounded-md border border-border p-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setView("rows")}
            className={cn(
              "h-7 w-7 rounded",
              !isTableView
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="List view"
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setView("table")}
            className={cn(
              "h-7 w-7 rounded",
              isTableView
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Table view"
            aria-label="Table view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex gap-1 flex-1 min-w-0">
          <ProInput
            ref={quickAddInputRef}
            value={newTaskTitle}
            onChange={(e) => dispatch(setNewTaskTitle(e.target.value))}
            placeholder={
              activeProject
                ? `Quick add to ${projects.find((p) => p.id === activeProject)?.name ?? "project"}...`
                : "Quick add task..."
            }
            onSubmit={() => void handleAddTask()}
            submitOnEnter
            submitLabel="Add task"
            submitDisabled={!newTaskTitle.trim() || isCreatingTask}
            isSubmitting={isCreatingTask}
            showCopyButton={false}
            className="h-8 text-xs bg-card"
            wrapperClassName="flex-1 min-w-0"
            disabled={isCreatingTask}
          />
        </div>
        {allVisibleTasks.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5">
            <CopyButtons
              size="xs"
              label="Task list"
              human={() => taskListHuman(allVisibleTasks, listView)}
              json={() => allVisibleTasks.map(taskRow)}
              agent={() =>
                buildTaskListPayload({
                  tasks: allVisibleTasks,
                  view: listView,
                  groups: groups.map((g) => ({
                    key: g.key,
                    label: g.label,
                    taskIds: g.tasks.map((t) => t.id),
                  })),
                })
              }
            />
            <ExportMenu
              label="Tasks"
              items={[
                jsonExportItem(() => allVisibleTasks.map(taskRow)),
                csvExportItem(
                  () => taskCsvRows(allVisibleTasks),
                  "CSV (every task in this view)",
                ),
              ]}
            />
          </div>
        )}
      </div>

      {groupByBanner && !isTableView && (
        <div className="shrink-0 px-3 py-1.5 border-b border-border/50 bg-muted/40">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
            {groupByBanner}
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isTableView ? (
          <TasksTableView />
        ) : loading && totalCount === 0 ? (
          <div className="space-y-1 p-2 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-muted/50 rounded" />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 px-6 py-12">
            <CircleDashed className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">No tasks match</p>
            <p className="text-[11px] mt-0.5 text-center">
              Adjust filters or add a task above
            </p>
          </div>
        ) : (
          <NonEditableContextMenu
            sourceFeature={TASKS_CONTEXT_MENU_PROPS.sourceFeature}
            surfaceName={TASKS_CONTEXT_MENU_PROPS.surfaceName}
            getApplicationScope={getMenuApplicationScope}
            resolveContextOnOpen={resolveMenuTarget}
            extraSections={menuSections}
          >
          <div className={cn(isGrouped && "p-2 space-y-2")}>
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              // Resolve scope ids to names where needed
              const displayLabel =
                group.label && group.label !== group.key
                  ? group.label
                  : (scopeNameMap[group.key] ?? group.label);
              return (
                <div
                  key={group.key}
                  className={cn(
                    isGrouped &&
                      "rounded-lg border border-border bg-card shadow-[var(--elevation-1)] overflow-hidden",
                  )}
                >
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={cn(
                      "group sticky top-0 z-10 flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors",
                      isGrouped
                        ? "bg-muted/50 border-b border-border/60"
                        : "bg-background/80 backdrop-blur-sm border-b border-border/30",
                    )}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
                    )}
                    <span className="flex-1 text-left truncate">
                      {displayLabel}
                    </span>
                    <span className="text-[11px] font-normal opacity-60 tabular-nums shrink-0">
                      {group.tasks.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-border/30">
                      {group.tasks.map((task) => (
                        <TaskRow
                          key={`${group.key}:${task.id}`}
                          task={task}
                          kpis={listKpis}
                          view={listView}
                          isSelected={selectedTaskId === task.id}
                          onSelect={() => handleSelectTask(task.id)}
                          onToggle={() =>
                            dispatch(
                              toggleTaskCompleteThunk({ taskId: task.id }),
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </NonEditableContextMenu>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function TaskRow({
  task,
  isSelected,
  onSelect,
  onToggle,
  kpis,
  view,
}: {
  task: TaskWithProject;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  /** The list's rendered KPIs + view state — carried into the row payload. */
  kpis: TaskListKpis;
  view: TaskListView;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const isPastDue =
    !!task.dueDate && task.dueDate < todayStr && !task.completed;

  return (
    <div
      onClick={onSelect}
      data-task-row-id={task.id}
      className={cn(
        "group flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors relative",
        isSelected ? "bg-primary/[0.08]" : "hover:bg-accent/40",
      )}
    >
      {/* Active indicator bar */}
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
      )}

      {/* Hover-reveal pair. The row selects on click — CopyButtons stops
          propagation so copying never changes the open task. */}
      <CopyButtons
        size="xs"
        label={task.title}
        className="absolute right-1.5 top-1.5 z-10 rounded bg-background/90 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        human={() => taskSummary(task)}
        json={() => taskRow(task)}
        agent={() => buildTaskRowPayload({ task, kpis, view })}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="mt-0.5 h-7 w-7 text-muted-foreground/70 hover:text-primary shrink-0"
        title={task.completed ? "Mark incomplete" : "Mark complete"}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
        ) : (
          <CircleDashed className="w-3.5 h-3.5" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <EntityRef
            token="task"
            id={task.id}
            name={task.title}
            showIcon={false}
            onOpen={onSelect}
            className="flex-1 min-w-0 text-[13px] leading-tight"
            labelClassName={
              task.completed
                ? "line-through text-muted-foreground"
                : "text-foreground font-medium"
            }
          />
          {task.priority && (
            <span
              className={cn(
                "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
                task.priority === "high" && "bg-destructive",
                task.priority === "medium" && "bg-warning",
                task.priority === "low" && "bg-success",
              )}
              title={`${task.priority} priority`}
            />
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 mt-0.5">
          {task.projectName && task.projectId !== "__unassigned__" && (
            <EntityRef
              token="project"
              id={task.projectId}
              name={task.projectName}
              className="max-w-[120px] text-[10px]"
            />
          )}
          {task.projectName && task.projectId === "__unassigned__" && (
            <span className="flex items-center gap-0.5 truncate max-w-[120px]">
              <Folder className="w-2.5 h-2.5" />
              <span className="truncate">{task.projectName}</span>
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                "flex items-center gap-0.5",
                isPastDue ? "text-destructive font-medium" : "",
              )}
            >
              <Calendar className="w-2.5 h-2.5" />
              {formatDateOnly(task.dueDate, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        <ScopeTagsDisplay
          entityType="task"
          entityId={task.id}
          className="mt-1 [&>*]:h-[18px] [&>*]:text-[9px] [&>*]:px-1.5 [&>*]:gap-0.5"
        />
      </div>
    </div>
  );
}
