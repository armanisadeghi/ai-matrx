"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  Calendar,
  CircleDashed,
  CheckCircle2,
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
  setSelectedTaskId,
  setNewTaskTitle,
} from "@/features/tasks/redux/taskUiSlice";
import { getTaskGroupByBanner } from "@/features/tasks/constants/groupBy";
import { makeSelectScopeNameMapForOrg } from "@/features/scopes/redux/selectors/tree";
import {
  createTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import type { TaskWithProject } from "@/features/tasks/types";
import TasksTableView from "@/features/tasks/components/TasksTableView";

type ListViewMode = "list" | "table";
const LIST_VIEW_STORAGE_KEY = "tasks-list-view";

export default function TaskListPane() {
  const dispatch = useAppDispatch();
  const groups = useAppSelector(selectGroupedFilteredTasks);
  const selectedTaskId = useAppSelector(selectSelectedTaskId);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const activeProject = useAppSelector(selectActiveProject);
  const projects = useAppSelector(selectProjects);
  const loading = useAppSelector(selectTasksLoading);
  const groupBy = useAppSelector(selectGroupBy);
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

  const [listView, setListView] = React.useState<ListViewMode>("list");
  React.useEffect(() => {
    const saved = window.localStorage.getItem(LIST_VIEW_STORAGE_KEY);
    if (saved === "list" || saved === "table") setListView(saved);
  }, []);
  const setListViewPersist = (mode: ListViewMode) => {
    setListView(mode);
    window.localStorage.setItem(LIST_VIEW_STORAGE_KEY, mode);
  };

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

  const [collapsedOverride, setCollapsedOverride] = useState<Set<string>>();

  useEffect(() => {
    setCollapsedOverride(undefined);
  }, [selectedTaskId, groupBy]);

  const collapsed = collapsedOverride ?? defaultCollapsed;

  const totalCount = groups.reduce((sum, g) => sum + g.tasks.length, 0);

  const handleSelectTask = (taskId: string) => {
    dispatch(setSelectedTaskId(taskId));
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const defaultScopeIds = Object.values(scopeSelections ?? {}).filter(
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
    if (newId) dispatch(setSelectedTaskId(newId));
  };

  const toggleGroup = (key: string) => {
    setCollapsedOverride((prev) => {
      const base = prev ?? defaultCollapsed;
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Quick-add — title moved to the shell header (PageHeader). */}
      <div className="shrink-0 px-2 py-2 border-b border-border/40 bg-muted/20 flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 pl-1">
          {totalCount}
        </span>
        <div className="flex items-center rounded-md border border-border p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setListViewPersist("list")}
            className={cn(
              "h-6 w-6 rounded flex items-center justify-center transition-colors",
              listView === "list"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setListViewPersist("table")}
            className={cn(
              "h-6 w-6 rounded flex items-center justify-center transition-colors",
              listView === "table"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Table view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
        <form onSubmit={handleAddTask} className="flex gap-1 flex-1 min-w-0">
          <Input
            type="text"
            value={newTaskTitle}
            onChange={(e) => dispatch(setNewTaskTitle(e.target.value))}
            placeholder={
              activeProject
                ? `Quick add to ${projects.find((p) => p.id === activeProject)?.name ?? "project"}...`
                : "Quick add task..."
            }
            className="h-7 text-xs bg-card"
            style={{ fontSize: "16px" }}
            disabled={isCreatingTask}
          />
          <button
            type="submit"
            disabled={!newTaskTitle.trim() || isCreatingTask}
            className="h-7 px-2 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {isCreatingTask ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
          </button>
        </form>
      </div>

      {groupByBanner && listView === "list" && (
        <div className="shrink-0 px-3 py-1.5 border-b border-border/50 bg-muted/40">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
            {groupByBanner}
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {listView === "table" ? (
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
}: {
  task: TaskWithProject;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const isPastDue =
    !!task.dueDate && task.dueDate < todayStr && !task.completed;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors relative",
        isSelected ? "bg-primary/[0.08]" : "hover:bg-accent/40",
      )}
    >
      {/* Active indicator bar */}
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="mt-0.5 text-muted-foreground/70 hover:text-primary transition-colors shrink-0"
        title={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <CircleDashed className="w-3.5 h-3.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <span
            className={cn(
              "flex-1 text-[13px] leading-tight truncate",
              task.completed
                ? "line-through text-muted-foreground"
                : "text-foreground font-medium",
            )}
          >
            {task.title}
          </span>
          {task.priority && (
            <span
              className={cn(
                "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
                task.priority === "high" && "bg-red-500",
                task.priority === "medium" && "bg-amber-500",
                task.priority === "low" && "bg-green-500",
              )}
              title={`${task.priority} priority`}
            />
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 mt-0.5">
          {task.projectName && (
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
              {new Date(task.dueDate).toLocaleDateString("en-US", {
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
