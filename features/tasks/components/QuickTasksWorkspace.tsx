"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  useEnsureHierarchyLoaded,
  useNavTree,
} from "@/features/agent-context/hooks/useNavTree";
import { selectAllTasks } from "@/features/agent-context/redux/tasksSlice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { Button } from "@/components/ui/button";
import { Search, Inbox, FolderKanban, Loader2 } from "lucide-react";
import CompactTaskItem from "@/features/tasks/components/CompactTaskItem";
import TaskDetailsPanel from "@/features/tasks/components/TaskDetailsPanel";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import {
  selectFilteredTasks,
  UNASSIGNED_PROJECT_ID,
} from "@/features/tasks/redux/selectors";
import {
  selectActiveProject,
  selectShowAllProjects,
  selectNewTaskTitle,
  selectIsCreatingTask,
  setActiveProject,
  setShowAllProjects,
  setNewTaskTitle,
} from "@/features/tasks/redux/taskUiSlice";
import {
  createTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectQuickTasksSelectedOrgId,
  selectQuickTasksSelectedTaskId,
  selectQuickTasksSearchQuery,
  setQuickTasksSelectedOrgId,
  setQuickTasksSelectedTaskId,
  setQuickTasksSearchQuery,
} from "@/features/tasks/redux/quickTasksWindowSlice";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";

function normalizeProjectIdForCreate(projectId: string | null): string | null {
  if (!projectId || projectId === UNASSIGNED_PROJECT_ID) return null;
  return projectId;
}

/** Tasks visible in the Quick Tasks window — org-scoped, hierarchy-hydrated. */
function useQuickTasksList() {
  const { isLoading, isSuccess, isError } = useEnsureHierarchyLoaded();
  const selectedOrgId = useAppSelector(selectQuickTasksSelectedOrgId);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const activeProject = useAppSelector(selectActiveProject);
  const filtered = useAppSelector(selectFilteredTasks);
  const allTaskRecords = useAppSelector(selectAllTasks);

  const tasks = useMemo(() => {
    if (!selectedOrgId) return filtered;
    const byId = new Map(allTaskRecords.map((r) => [r.id, r] as const));
    return filtered.filter((t) => {
      const rec = byId.get(t.id);
      return rec ? rec.organization_id === selectedOrgId : true;
    });
  }, [filtered, selectedOrgId, allTaskRecords]);

  return {
    tasks,
    isLoading,
    isSuccess,
    isError,
    showAllProjects,
    activeProject,
  };
}

/**
 * Thin Provider-less wrapper: seeds the Quick Tasks window's org selection from
 * the hierarchy on first mount, ensures tasks are fetched, and scopes the list
 * to "all tasks" while the window is open (restores /tasks view state on close).
 * All state lives in Redux (quickTasksWindow + tasksUi slices).
 */
export function QuickTasksWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const { orgs, isSuccess } = useNavTree();
  const selectedOrgId = useAppSelector(selectQuickTasksSelectedOrgId);
  const appOrgId = useAppSelector(selectOrganizationId);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const activeProject = useAppSelector(selectActiveProject);
  const savedViewRef = useRef<{
    showAllProjects: boolean;
    activeProject: string | null;
  } | null>(null);

  useEffect(() => {
    savedViewRef.current = { showAllProjects, activeProject };
    dispatch(setShowAllProjects(true));
    dispatch(setActiveProject(null));
    return () => {
      const saved = savedViewRef.current;
      if (!saved) return;
      dispatch(setShowAllProjects(saved.showAllProjects));
      dispatch(setActiveProject(saved.activeProject));
    };
    // Capture /tasks view mode once on open; restore on close only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    if (isSuccess && !selectedOrgId) {
      const initialOrgId = appOrgId ?? orgs[0]?.id ?? null;
      if (initialOrgId) dispatch(setQuickTasksSelectedOrgId(initialOrgId));
    }
  }, [dispatch, isSuccess, orgs, selectedOrgId, appOrgId]);

  return <>{children}</>;
}

export function QuickTasksSidebar() {
  const dispatch = useAppDispatch();
  const selectedOrgId = useAppSelector(selectQuickTasksSelectedOrgId);
  const selectedProjectId = useAppSelector(selectActiveProject);
  const selectedTaskId = useAppSelector(selectQuickTasksSelectedTaskId);
  const searchQuery = useAppSelector(selectQuickTasksSearchQuery);
  const { tasks, isLoading, showAllProjects } = useQuickTasksList();

  const tasksToDisplay = useMemo(() => {
    if (!searchQuery) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || idMatchesQuery(t, q),
    );
  }, [tasks, searchQuery]);

  return (
    <div className="flex flex-col min-h-0 h-full bg-card">
      <div className="px-2 py-2 border-b shrink-0 bg-muted/10">
        <HierarchyCascade
          levels={["organization", "scope", "project", "task"]}
          value={{
            ...EMPTY_SELECTION,
            organizationId: selectedOrgId,
            projectId: selectedProjectId,
            taskId: selectedTaskId,
          }}
          onChange={(sel) => {
            if (sel.organizationId !== selectedOrgId)
              dispatch(setQuickTasksSelectedOrgId(sel.organizationId));
            if (sel.projectId !== selectedProjectId) {
              dispatch(setActiveProject(sel.projectId));
              dispatch(setShowAllProjects(!sel.projectId));
            }
            if (sel.taskId !== selectedTaskId)
              dispatch(setQuickTasksSelectedTaskId(sel.taskId));
          }}
          layout="vertical"
        />
      </div>

      <div className="px-2 py-1.5 border-b flex items-center justify-between shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => dispatch(setQuickTasksSearchQuery(e.target.value))}
            className="h-7 pl-7 text-[11px]"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2 mt-4">
            <Loader2 className="h-5 w-5 animate-spin opacity-50" />
            <p>Loading tasks...</p>
          </div>
        ) : tasksToDisplay.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2 mt-4">
            <Inbox className="h-6 w-6 opacity-20" />
            <p>No tasks found.</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {tasksToDisplay.map((task) => (
              <CompactTaskItem
                key={task.id}
                task={task}
                layout="stacked"
                isSelected={selectedTaskId === task.id}
                onSelect={() => dispatch(setQuickTasksSelectedTaskId(task.id))}
                onToggleComplete={() =>
                  dispatch(toggleTaskCompleteThunk({ taskId: task.id }))
                }
                hideProjectName={!showAllProjects}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuickTasksMain() {
  const dispatch = useAppDispatch();
  const selectedTaskId = useAppSelector(selectQuickTasksSelectedTaskId);
  const selectedProjectId = useAppSelector(selectActiveProject);
  const quickTasksOrgId = useAppSelector(selectQuickTasksSelectedOrgId);
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const {
    inputRef: quickAddInputRef,
    scheduleRefocus: scheduleQuickAddRefocus,
  } = useRefocusInputAfterAsync(isCreatingTask);
  const { tasks } = useQuickTasksList();
  const appOrgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const organizationId = quickTasksOrgId ?? appOrgId;

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((t) => t.id === selectedTaskId) || null;
  }, [selectedTaskId, tasks]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    const defaultScopeIds = Object.values(scopeSelections).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const newId = await dispatch(
      createTaskThunk({
        title: newTaskTitle,
        projectId: normalizeProjectIdForCreate(selectedProjectId),
        organizationId,
        priority: "medium",
        scopeIds: defaultScopeIds,
      }),
    ).unwrap();
    if (newId) {
      dispatch(setQuickTasksSelectedTaskId(newId));
      scheduleQuickAddRefocus();
    }
  };

  if (!selectedTask) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-6 bg-card/50">
        <FolderKanban className="h-12 w-12 text-muted-foreground/20 mb-4" />
        <h3 className="text-sm font-medium mb-1">No Task Selected</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Select a task from the sidebar, or create a new one.
        </p>

        <ProInput
          ref={quickAddInputRef}
          value={newTaskTitle}
          onChange={(e) => dispatch(setNewTaskTitle(e.target.value))}
          onSubmit={() => void handleAddTask()}
          submitOnEnter
          submitLabel="Add task"
          submitDisabled={isCreatingTask || !newTaskTitle.trim()}
          isSubmitting={isCreatingTask}
          showCopyButton={false}
          placeholder="Enter new task title..."
          disabled={isCreatingTask}
          className="h-8 text-[13px] flex-1"
          wrapperClassName="w-full max-w-sm"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background overflow-hidden relative">
      <div className="absolute top-2 right-2 z-10 opacity-0 hover:opacity-100 transition-opacity">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-background/50 backdrop-blur"
          onClick={() => dispatch(setQuickTasksSelectedTaskId(null))}
        >
          Close Details
        </Button>
      </div>
      <TaskDetailsPanel
        task={selectedTask}
        titleLayout="stacked"
        onClose={() => dispatch(setQuickTasksSelectedTaskId(null))}
      />
    </div>
  );
}
