"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Folder, FolderPlus, Search, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectProjectId,
  selectProjectName,
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import {
  selectProjects,
  selectFilteredTasks,
} from "@/features/tasks/redux/selectors";
import {
  selectActiveProject,
  selectShowAllProjects,
  selectNewTaskTitle,
  selectNewProjectName,
  selectIsCreatingTask,
  selectIsCreatingProject,
  selectTasksLoading,
  selectSearchQuery,
  selectSortBy,
  setNewTaskTitle,
  setNewProjectName,
  setSearchQuery,
  setSortBy,
} from "@/features/tasks/redux/taskUiSlice";
import {
  createTaskThunk,
  createProjectThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { useHierarchyReduxBridge } from "@/features/agent-context/components/hierarchy-selection/useReduxBridge";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import CompactTaskItem from "./CompactTaskItem";
import TaskDetailsPanel from "./TaskDetailsPanel";
import AllTasksView from "./AllTasksView";
import TaskSortControl from "./TaskSortControl";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TaskContentNew() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dispatch = useAppDispatch();
  const activeProject = useAppSelector(selectActiveProject);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const projects = useAppSelector(selectProjects);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const newProjectName = useAppSelector(selectNewProjectName);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const {
    inputRef: quickAddInputRef,
    scheduleRefocus: scheduleQuickAddRefocus,
  } = useRefocusInputAfterAsync(isCreatingTask);
  const isCreatingProject = useAppSelector(selectIsCreatingProject);
  const loading = useAppSelector(selectTasksLoading);
  const searchQuery = useAppSelector(selectSearchQuery);
  const sortBy = useAppSelector(selectSortBy);
  const filteredTasks = useAppSelector(selectFilteredTasks);
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const { value: ctxValue, onChange: ctxOnChange } = useHierarchyReduxBridge();

  const appProjectId = useAppSelector(selectProjectId);
  const appProjectName = useAppSelector(selectProjectName);

  // Initialise from ?task= URL param so the panel survives a page refresh
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() =>
    searchParams.get("task"),
  );
  const [selectedProjectForTask, setSelectedProjectForTask] = useState<
    string | null
  >(null);
  const [showQuickAddDescription, setShowQuickAddDescription] = useState(false);
  const [quickAddDescription, setQuickAddDescription] = useState("");

  // Update selected project: prefer app-wide context, then sidebar activeProject, then first project
  useEffect(() => {
    if (appProjectId) {
      setSelectedProjectForTask(appProjectId);
    } else if (activeProject) {
      setSelectedProjectForTask(activeProject);
    } else if (projects.length > 0) {
      setSelectedProjectForTask(projects[0].id);
    }
  }, [appProjectId, activeProject, projects]);

  const hasProjects = projects.length > 0;
  const canShowTasks = activeProject || showAllProjects;
  const shouldShowProjectSelector = showAllProjects || !activeProject;

  // Find selected task
  const selectedTask = selectedTaskId
    ? filteredTasks.find((t) => t.id === selectedTaskId)
    : null;

  const handleTaskSelect = (taskId: string) => {
    const next = taskId === selectedTaskId ? null : taskId;
    setSelectedTaskId(next);
    // Keep the URL in sync so cmd+R restores panel state (shallow — no navigation)
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("task", next);
    } else {
      params.delete("task");
    }
    router.replace(`/tasks?${params.toString()}`, { scroll: false });
  };

  const handleTaskToggle = (_projectId: string, taskId: string) => {
    dispatch(toggleTaskCompleteThunk({ taskId }));
  };

  const handleAddTask = async () => {
    const trimmedTitle = newTaskTitle.trim();
    if (!trimmedTitle) return;
    if (trimmedTitle.length > 200) return;

    const defaultScopeIds = Object.values(scopeSelections).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );

    const newTaskId = await dispatch(
      createTaskThunk({
        title: trimmedTitle,
        description: quickAddDescription.trim() || null,
        projectId: selectedProjectForTask ?? null,
        organizationId: orgId,
        scopeIds: defaultScopeIds,
      }),
    ).unwrap();

    if (newTaskId) {
      setSelectedTaskId(newTaskId);
      scheduleQuickAddRefocus();
    }

    setQuickAddDescription("");
    setShowQuickAddDescription(false);
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await dispatch(createProjectThunk({ name: newProjectName }));
  };

  const handleTitleChange = (value: string) => {
    dispatch(setNewTaskTitle(value));
    if (value.trim() && !showQuickAddDescription) {
      setShowQuickAddDescription(true);
    }
  };

  // Loading skeleton
  if (loading && projects.length === 0) {
    return (
      <div className="flex-1 flex overflow-hidden bg-textured">
        <div className="flex-1 p-4 space-y-3 animate-pulse">
          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              className="bg-card rounded-lg border border-border p-3 h-16"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-textured">
      <div className="shrink-0 px-4 py-2 border-b border-border bg-card">
        <HierarchyCascade
          levels={["organization", "scope", "project"]}
          value={ctxValue}
          onChange={ctxOnChange}
          requireProject
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Empty state - No projects at all */}
        {!hasProjects && !showAllProjects && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                  <FolderPlus className="w-10 h-10 text-primary" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                Welcome to Tasks!
              </h3>
              <p className="text-muted-foreground mb-8">
                Get organized by creating your first project.
              </p>

              <form onSubmit={handleAddProject} className="space-y-3">
                <Input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => dispatch(setNewProjectName(e.target.value))}
                  placeholder="Project name (e.g., Personal, Work)"
                  disabled={isCreatingProject}
                  className="w-full"
                />
                <Button
                  type="submit"
                  disabled={!newProjectName.trim() || isCreatingProject}
                  className="w-full"
                  size="lg"
                >
                  {isCreatingProject ? (
                    <>
                      <Loader2 size={20} className="mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <FolderPlus size={20} className="mr-2" />
                      Create Project
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* Empty state - Has projects but none selected */}
        {hasProjects && !activeProject && !showAllProjects && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                  <svg
                    className="w-10 h-10 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                Select a project
              </h3>
              <p className="text-muted-foreground">
                Choose a project from the sidebar to view and manage its tasks
              </p>
            </div>
          </div>
        )}

        {/* Main content - Stable Two-Column Layout */}
        {canShowTasks && (
          <>
            {/* Task List Column - Fixed width, always in same position */}
            <div className="flex flex-col overflow-hidden flex-1 max-w-4xl">
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-3">
                  {/* Search Bar and Sort Controls */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                        size={16}
                      />
                      <Input
                        type="text"
                        value={searchQuery}
                        onChange={(e) =>
                          dispatch(setSearchQuery(e.target.value))
                        }
                        placeholder="Search tasks by name, description, or project..."
                        className="pl-9 pr-9 h-9 text-sm bg-card"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => dispatch(setSearchQuery(""))}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    <TaskSortControl
                      currentSort={sortBy}
                      onSortChange={(s) => dispatch(setSortBy(s))}
                      compact={false}
                    />
                  </div>

                  {/* Quick Add Input */}
                  <div className="bg-card rounded-lg border border-border shadow-sm p-3 space-y-2">
                    <ProInput
                      ref={quickAddInputRef}
                      value={newTaskTitle}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      onSubmit={() => void handleAddTask()}
                      submitOnEnter
                      submitLabel="Add task"
                      submitDisabled={
                        !newTaskTitle.trim() ||
                        isCreatingTask ||
                        !selectedProjectForTask
                      }
                      isSubmitting={isCreatingTask}
                      showCopyButton={false}
                      placeholder="Quick Add: e.g. 'Review Q4 budget proposal tomorrow at 2pm'..."
                      disabled={isCreatingTask}
                      className="border-none shadow-none focus-visible:ring-0 pl-2 text-sm"
                      wrapperClassName="w-full"
                    />

                    {showQuickAddDescription && (
                      <ProTextarea
                        value={quickAddDescription}
                        onChange={(e) => setQuickAddDescription(e.target.value)}
                        placeholder="Add a description (optional)..."
                        autoGrow
                        minHeight={60}
                        maxHeight={180}
                        showCopyButton={false}
                        className="text-sm resize-y min-h-[60px]"
                        wrapperClassName="w-full"
                      />
                    )}

                    <div className="flex items-center gap-2">
                      {shouldShowProjectSelector && projects.length > 0 ? (
                        <HierarchyCascade
                          levels={["organization", "scope", "project"]}
                          value={{
                            ...EMPTY_SELECTION,
                            projectId: selectedProjectForTask,
                          }}
                          onChange={(sel) => {
                            if (sel.projectId)
                              setSelectedProjectForTask(sel.projectId);
                          }}
                        />
                      ) : activeProject ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Folder size={12} />
                          <span>
                            {projects.find((p) => p.id === activeProject)?.name}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Task List */}
                  {showAllProjects ? (
                    <AllTasksView
                      selectedTaskId={selectedTaskId}
                      onTaskSelect={handleTaskSelect}
                      onTaskToggle={handleTaskToggle}
                    />
                  ) : (
                    <div className="space-y-2">
                      {filteredTasks.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-muted-foreground text-sm">
                            No tasks yet. Create one above!
                          </p>
                        </div>
                      ) : (
                        filteredTasks.map((task) => (
                          <CompactTaskItem
                            key={task.id}
                            task={task}
                            isSelected={selectedTaskId === task.id}
                            onSelect={() => handleTaskSelect(task.id)}
                            onToggleComplete={() =>
                              handleTaskToggle(task.projectId, task.id)
                            }
                            hideProjectName={!showAllProjects}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Task Details Panel (Right Sidebar) - Always visible for stable layout */}
            <div className="w-96 flex-shrink-0 border-l border-border bg-card">
              {selectedTask ? (
                <TaskDetailsPanel
                  task={selectedTask}
                  onClose={() => {
                    setSelectedTaskId(null);
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete("task");
                    const qs = params.toString();
                    router.replace(qs ? `/tasks?${qs}` : "/tasks", {
                      scroll: false,
                    });
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full p-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-foreground mb-2">
                      No Task Selected
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Select a task from the list to view and edit its details
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
