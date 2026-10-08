"use client";

import React, { useState } from "react";
import {
  ChevronRight,
  Plus,
  MoreVertical,
  X,
  Loader2,
} from "lucide-react";
import { useAppDispatch, useAppSelector, useDispatchThunk } from "@/lib/redux/hooks";
import {
  selectFullContextError,
  selectFullContextStatus,
} from "@/features/agent-context/redux/hierarchySlice";
import { fetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { ErrorNotice } from "@ai-matrx/design-system";
import {
  selectFilteredTasks,
  selectProjects,
} from "@/features/tasks/redux/selectors";
import {
  selectNewTaskTitle,
  selectIsCreatingTask,
  selectSearchQuery,
  selectShowAllProjects,
  selectActiveProject,
  selectShowCompleted,
  selectSmartView,
  setNewTaskTitle,
  setSearchQuery,
} from "@/features/tasks/redux/taskUiSlice";
import {
  createTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { Button } from "@/components/ui/button";
import { Input, SearchField } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import MobileFilterMenu from "./MobileFilterMenu";
import MobileProjectSelector from "./MobileProjectSelector";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import { ActiveScopeFilterChips } from "../TaskScopeFilter";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { formatDateOnly } from "@ai-matrx/kit/dates";
import {
  TASK_ROW_DOM_ATTR,
  TasksListContextMenu,
} from "@/features/tasks/components/TasksListContextMenu";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  buildTaskListPayload,
  taskListHuman,
  taskRow,
} from "@/features/tasks/lib/copy";

interface MobileTasksListProps {
  onTaskSelect: (taskId: string) => void;
}

export default function MobileTasksList({
  onTaskSelect,
}: MobileTasksListProps) {
  const dispatch = useAppDispatch();
  const dispatchThunk = useDispatchThunk();
  // The task list is a projection of the one hierarchy read. Until it
  // succeeds an empty list means "unknown" — a failed read must say so, never
  // "No tasks yet" (the desktop workbench already did; RC-B12 round 5).
  const hierarchyStatus = useAppSelector(selectFullContextStatus);
  const hierarchyError = useAppSelector(selectFullContextError);
  const filteredTasks = useAppSelector(selectFilteredTasks);
  const projects = useAppSelector(selectProjects);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const searchQuery = useAppSelector(selectSearchQuery);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const activeProject = useAppSelector(selectActiveProject);
  const showCompleted = useAppSelector(selectShowCompleted);
  const smartView = useAppSelector(selectSmartView);
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const copySourceId = React.useId();

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedProjectForTask, setSelectedProjectForTask] = useState<
    string | null
  >(activeProject || null);

  const canShowTasks = activeProject || showAllProjects;

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const defaultScopeIds = Object.values(scopeSelections).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    try {
      const createdId = await dispatch(
        createTaskThunk({
          title: newTaskTitle,
          projectId: selectedProjectForTask ?? null,
          organizationId: orgId,
          scopeIds: defaultScopeIds,
        }),
      ).unwrap();
      if (!createdId) {
        toast.error("Could not create task");
        return;
      }
      setShowQuickAdd(false);
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Could not create task");
    }
  };

  const handleToggleComplete = async (taskId: string) => {
    try {
      await dispatch(toggleTaskCompleteThunk({ taskId })).unwrap();
    } catch (error) {
      console.error("Error changing task completion:", error);
      toast.error("Could not update task completion");
    }
  };

  const currentProjectName = activeProject
    ? projects.find((p) => p.id === activeProject)?.name
    : "All Tasks";
  const listView = {
    smartView,
    projectName: activeProject ? (currentProjectName ?? null) : null,
    searchQuery,
    showCompleted,
  };

  return (
    <TasksListContextMenu
      tasks={filteredTasks}
      projects={projects}
      searchQuery={searchQuery}
    >
      <div
        className="h-full flex flex-col bg-background overflow-hidden"
        data-surface-value="task_list"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border bg-card">
          {/* Title Bar — min-h-16 = padding + the 44px touch-target actions: the copy menu joins the
              row once tasks load, and a row that grew 12px then shoved the whole list (CLS 0.93). */}
          <div className="flex min-h-16 min-w-0 items-center justify-between gap-2 px-4 pt-3 pb-2">
            <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-foreground">
              {currentProjectName}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              {canShowTasks && filteredTasks.length > 0 && (
                <CopyButtons
                  sourceId={`task-list:mobile:${copySourceId}`}
                  size="sm"
                  unified
                  label="Task list"
                  human={() => taskListHuman(filteredTasks, listView)}
                  json={() => filteredTasks.map(taskRow)}
                  agent={() =>
                    buildTaskListPayload({
                      tasks: filteredTasks,
                      view: listView,
                    })
                  }
                  export={{
                    sheetRows: () => filteredTasks.map(taskRow),
                    items: [],
                  }}
                />
              )}
              <Button
                icon={<Plus size={16} />}
                type="submit"
                variant="quiet"
                onClick={() => setShowQuickAdd(!showQuickAdd)}
                aria-label="Add task"
              />
              <MobileFilterMenu />
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-4 pb-2">
            <div data-surface-value="search_query">
              <SearchField
                className="w-full"
                value={searchQuery}
                onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                placeholder="Search tasks..."
                end={
                  searchQuery ? (
                    <button type="button" onClick={() => dispatch(setSearchQuery(""))} aria-label="Clear task search">
                      <X size={16} />
                    </button>
                  ) : undefined
                }
              />
            </div>
          </div>

          {/* Quick Add (Expandable) */}
          {showQuickAdd && (
            <div className="px-4 pb-2 animate-in slide-in-from-top-2 duration-200">
              <form onSubmit={handleAddTask} className="space-y-2">
                <Input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => dispatch(setNewTaskTitle(e.target.value))}
                  placeholder="New task..."
                  autoFocus
                  onFocus={(e) => {
                    // Scroll into view when keyboard appears on mobile
                    setTimeout(() => {
                      e.target.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }, 300);
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="outline"
                    className="flex-1 justify-start"
                    onClick={() => setShowProjectSelector(true)}
                  >
                    <span className="truncate">
                      {selectedProjectForTask
                        ? projects.find((p) => p.id === selectedProjectForTask)
                            ?.name
                        : "Select Project"}
                    </span>
                  </Button>
                  <MatrxDynamicPanelHost
                    open={showProjectSelector}
                    onOpenChange={setShowProjectSelector}
                    title="Select Project"
                    description="Choose a project for this task"
                    position="bottom"
                    defaultSize={50}
                    contentClassName="overflow-y-auto"
                  >
                    <MobileProjectSelector
                      selectedProjectId={selectedProjectForTask}
                      onSelectProject={(projectId) => {
                        setSelectedProjectForTask(projectId);
                        setShowProjectSelector(false);
                      }}
                    />
                  </MatrxDynamicPanelHost>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={
                      !newTaskTitle.trim() ||
                      isCreatingTask ||
                      !selectedProjectForTask
                    }
                  >
                    {isCreatingTask ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Active scope-filter chips */}
        <ActiveScopeFilterChips />

        {/* Task List — the page's scroll owner: it takes the shell's runway (what floats, a
            toast included, + the page end), never a hand pb-20 that a toast still covered. */}
        <div data-matrx-page-scroll="" className="flex-1 overflow-y-auto overscroll-contain">
          {!canShowTasks ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">
                  Select a project from the menu to get started
                </p>
              </div>
            </div>
          ) : filteredTasks.length === 0 && hierarchyStatus === "error" ? (
            <div className="p-4">
              <ErrorNotice
                title="Your tasks couldn't load"
                error={hierarchyError}
                message={hierarchyError ?? "The task list could not be read."}
                operation="Load your tasks"
                actions={
                  <Button
                    type="submit"
                    variant="outline"
                    onClick={() => void dispatchThunk(fetchFullContext())}
                  >
                    Retry
                  </Button>
                }
              />
            </div>
          ) : filteredTasks.length === 0 && hierarchyStatus !== "success" ? (
            <div
              className="flex items-center justify-center h-full p-8"
              aria-busy="true"
            >
              <p className="text-muted-foreground text-sm">Loading your tasks…</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">
                  {searchQuery
                    ? "No tasks found"
                    : "No tasks yet. Create one above!"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredTasks.map((task) => {
                const isPastDue =
                  task.dueDate &&
                  task.dueDate < new Date().toISOString().split("T")[0] &&
                  !task.completed;

                return (
                  <div
                    key={task.id}
                    {...{
                      [TASK_ROW_DOM_ATTR]: task.id,
                      "data-task-id": task.id,
                    }}
                    onClick={() => onTaskSelect(task.id)}
                    className="flex items-center gap-3 p-4 active:bg-muted/50 transition-colors cursor-pointer"
                  >
                    {/* Checkbox */}
                    <Checkbox
                      checked={task.completed}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => void handleToggleComplete(task.id)}
                      className="relative mx-[15px] after:absolute after:-inset-[15px] after:rounded-full after:content-['']"
                      aria-label={
                        task.completed ? "Mark incomplete" : "Mark complete"
                      }
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3
                        title={task.title}
                        className={`mb-1 min-w-0 truncate text-base font-medium ${
                          task.completed
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {task.title}
                      </h3>
                      <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground">
                        {task.projectName && showAllProjects && (
                          <span
                            className="min-w-0 flex-1 truncate text-primary"
                            title={task.projectName}
                          >
                            ● {task.projectName}
                          </span>
                        )}
                        {task.dueDate && (
                          <span
                            className={`shrink-0 ${
                              isPastDue ? "text-destructive font-medium" : ""
                            }`}
                          >
                            {formatDateOnly(task.dueDate, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                        {task.priority && (
                          <span className="shrink-0 capitalize">
                            {task.priority}
                          </span>
                        )}
                      </div>
                      <ScopeTagsDisplay
                        entityType="task"
                        entityId={task.id}
                        className="mt-1.5"
                      />
                    </div>

                    {/* Chevron */}
                    <ChevronRight
                      size={20}
                      className="text-muted-foreground flex-shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TasksListContextMenu>
  );
}
