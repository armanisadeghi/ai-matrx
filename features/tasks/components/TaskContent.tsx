// Task Content Component
"use client";

import React, { JSX, useState, useEffect } from "react";
import {
  PlusCircle,
  FolderPlus,
  Calendar,
  FileText,
  ChevronUp,
  Loader2,
  Folder,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFilteredTasks,
  selectProjects,
} from "@/features/tasks/redux/selectors";
import {
  selectActiveProject,
  selectShowAllProjects,
  selectNewTaskTitle,
  selectNewProjectName,
  selectIsCreatingTask,
  selectIsCreatingProject,
  selectTasksLoading,
  setNewTaskTitle,
  setNewProjectName,
} from "@/features/tasks/redux/taskUiSlice";
import {
  createProjectThunk,
  createTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import TaskHeader from "./TaskHeader";
import TaskList from "./TaskList";
import AllTasksView from "./AllTasksView";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";

export default function TaskContent(): JSX.Element {
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
  const filteredTasks = useAppSelector(selectFilteredTasks);
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [selectedProjectForTask, setSelectedProjectForTask] = useState<
    string | null
  >(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Update selected project when activeProject changes
  useEffect(() => {
    if (activeProject) {
      setSelectedProjectForTask(activeProject);
    } else if (projects.length > 0) {
      // Default to first project if no active project
      setSelectedProjectForTask(projects[0].id);
    }
  }, [activeProject, projects]);

  const hasProjects = projects.length > 0;
  const canShowTasks = activeProject || showAllProjects;

  // Show loading state during initial fetch
  if (loading && projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TaskHeader />
        <main className="flex-1 overflow-y-auto p-4 bg-textured">
          <div className="mx-auto max-w-4xl space-y-3 animate-pulse">
            {/* Add task form skeleton */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border-border p-3">
              <div className="space-y-2">
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="flex gap-2">
                  <div className="h-9 flex-1 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </div>

            {/* Skeleton task items */}
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-800 rounded-lg border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const trimmedTitle = newTaskTitle.trim();
    if (!trimmedTitle) {
      return; // Don't create empty tasks
    }

    if (trimmedTitle.length > 200) {
      // Could add a toast here
      return;
    }

    const defaultScopeIds = Object.values(scopeSelections ?? {}).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const newId = await dispatch(
      createTaskThunk({
        title: newTaskTitle,
        description: taskDescription.trim() || null,
        dueDate: taskDueDate || null,
        projectId: selectedProjectForTask ?? null,
        organizationId: orgId,
        scopeIds: defaultScopeIds,
      }),
    ).unwrap();

    if (newId) {
      scheduleQuickAddRefocus();
    }

    // Reset all fields
    setTaskDescription("");
    setTaskDueDate("");
    setShowAdvanced(false);
  };

  // Show advanced options when user starts typing
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setNewTaskTitle(e.target.value));
    if (e.target.value.trim() && !showAdvanced) {
      setShowAdvanced(true);
    }
  };

  // Get display name for the selected project
  const getProjectDisplayName = () => {
    const project = projects.find((p) => p.id === selectedProjectForTask);
    return project?.name || "Select project";
  };

  // Determine if project selector should be shown
  const shouldShowProjectSelector = showAllProjects || !activeProject;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TaskHeader />

      <main className="flex-1 overflow-y-auto p-4 bg-textured">
        {/* Add Task Form - Show when viewing tasks */}
        {canShowTasks && (
          <div className="mb-3 mx-auto max-w-4xl">
            <div className="bg-white dark:bg-gray-800 rounded-lg border-border p-3 shadow-sm">
              <form onSubmit={handleAddTask} className="space-y-2">
                {/* Input row */}
                <div className="flex items-center gap-2">
                  <Input
                    ref={quickAddInputRef}
                    type="text"
                    value={newTaskTitle}
                    onChange={handleTitleChange}
                    placeholder={`Add a new task${!shouldShowProjectSelector && activeProject ? ` to ${projects.find((p) => p.id === activeProject)?.name}` : ""}...`}
                    disabled={isCreatingTask}
                    className="flex-1"
                  />
                </div>

                {/* Project selector and add button row */}
                <div className="flex items-center gap-2">
                  {shouldShowProjectSelector && projects.length > 0 ? (
                    <div className="flex-1">
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
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 flex-1">
                      <Folder size={14} />
                      <span>
                        {projects.find((p) => p.id === activeProject)?.name}
                      </span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      !newTaskTitle.trim() ||
                      isCreatingTask ||
                      !selectedProjectForTask
                    }
                    size="sm"
                    className="h-9 px-3"
                  >
                    {isCreatingTask ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <PlusCircle size={16} />
                    )}
                  </Button>
                </div>

                {/* Advanced options - Show when user starts typing */}
                {showAdvanced && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Calendar size={12} />
                          Due Date
                        </label>
                        <Input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <FileText size={12} />
                          Description
                        </label>
                        <Textarea
                          value={taskDescription}
                          onChange={(e) => setTaskDescription(e.target.value)}
                          placeholder="Add details..."
                          className="text-sm resize-y"
                          rows={1}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAdvanced(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
                    >
                      <ChevronUp size={12} />
                      Hide
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Empty state - No projects at all */}
        {!hasProjects && !showAllProjects && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/20 mb-4">
                  <FolderPlus className="w-10 h-10 text-blue-500 dark:text-blue-400" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
                Welcome to Tasks!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Get organized by creating your first project, or switch to "All
                Tasks" to create standalone tasks.
              </p>

              {/* Inline Project Creation */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (newProjectName.trim()) {
                    await dispatch(
                      createProjectThunk({ name: newProjectName }),
                    );
                  }
                }}
                className="space-y-3"
              >
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
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/20 mb-4">
                  <svg
                    className="w-10 h-10 text-blue-500 dark:text-blue-400"
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
              <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
                Select a project
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Choose a project from the sidebar to view and manage its tasks
              </p>
            </div>
          </div>
        )}

        {/* Tasks Display - Use AllTasksView when showing all projects */}
        {canShowTasks && (
          <div className="mx-auto max-w-4xl">
            {showAllProjects ? (
              <AllTasksView
                selectedTaskId={selectedTaskId}
                onTaskSelect={setSelectedTaskId}
                onTaskToggle={(_projectId, taskId) => {
                  dispatch(toggleTaskCompleteThunk({ taskId }));
                }}
              />
            ) : (
              <TaskList tasks={filteredTasks} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
