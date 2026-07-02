// Task Content Component
"use client";

import React, { JSX, useState, useEffect } from "react";
import {
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
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
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
            <div className="bg-card rounded-lg border border-border p-3">
              <div className="space-y-2">
                <div className="h-10 bg-muted rounded" />
                <div className="flex gap-2">
                  <div className="h-9 flex-1 bg-muted rounded" />
                  <div className="h-9 w-9 bg-muted rounded" />
                </div>
              </div>
            </div>

            {/* Skeleton task items */}
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="bg-card rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-muted rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const handleAddTask = async () => {
    const trimmedTitle = newTaskTitle.trim();
    if (!trimmedTitle) return;
    if (trimmedTitle.length > 200) return;

    const defaultScopeIds = Object.values(scopeSelections).filter(
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
            <div className="bg-card rounded-lg border border-border p-3 shadow-sm">
              <div className="space-y-2">
                <ProInput
                  ref={quickAddInputRef}
                  value={newTaskTitle}
                  onChange={handleTitleChange}
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
                  placeholder={`Add a new task${!shouldShowProjectSelector && activeProject ? ` to ${projects.find((p) => p.id === activeProject)?.name}` : ""}...`}
                  disabled={isCreatingTask}
                  wrapperClassName="w-full"
                />

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
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1">
                      <Folder size={14} />
                      <span>
                        {projects.find((p) => p.id === activeProject)?.name}
                      </span>
                    </div>
                  )}
                </div>

                {showAdvanced && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
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

                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <FileText size={12} />
                          Description
                        </label>
                        <ProTextarea
                          value={taskDescription}
                          onChange={(e) => setTaskDescription(e.target.value)}
                          placeholder="Add details..."
                          autoGrow
                          minHeight={48}
                          maxHeight={160}
                          showCopyButton={false}
                          className="text-sm resize-y"
                          wrapperClassName="w-full"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAdvanced(false)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <ChevronUp size={12} />
                      Hide
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state - No projects at all */}
        {!hasProjects && !showAllProjects && (
          <div className="flex items-center justify-center min-h-[400px]">
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
