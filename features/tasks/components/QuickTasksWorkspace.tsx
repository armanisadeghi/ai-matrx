"use client";

import React, { useEffect, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Inbox, Plus, Folder, FolderKanban } from "lucide-react";
import CompactTaskItem from "@/features/tasks/components/CompactTaskItem";
import TaskDetailsPanel from "@/features/tasks/components/TaskDetailsPanel";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import { selectFilteredTasks } from "@/features/tasks/redux/selectors";
import {
  selectActiveProject,
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

/**
 * Thin Provider-less wrapper: seeds the Quick Tasks window's org/project
 * selection from the hierarchy on first mount and when the user switches orgs.
 * All state lives in Redux (quickTasksWindow + tasksUi slices).
 */
export function QuickTasksWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const { orgs, flatProjects, isSuccess } = useNavTree();
  const selectedOrgId = useAppSelector(selectQuickTasksSelectedOrgId);
  const activeProject = useAppSelector(selectActiveProject);

  useEffect(() => {
    if (isSuccess && !selectedOrgId && orgs.length > 0) {
      dispatch(setQuickTasksSelectedOrgId(orgs[0].id));
    }
  }, [dispatch, isSuccess, orgs, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    const projs = flatProjects.filter((p) => p.org_id === selectedOrgId);
    if (
      projs.length > 0 &&
      (!activeProject || !projs.find((p) => p.id === activeProject))
    ) {
      dispatch(setActiveProject(projs[0].id));
      dispatch(setShowAllProjects(false));
    }
  }, [dispatch, selectedOrgId, flatProjects, activeProject]);

  return <>{children}</>;
}

export function QuickTasksSidebar() {
  const dispatch = useAppDispatch();
  const selectedOrgId = useAppSelector(selectQuickTasksSelectedOrgId);
  const selectedProjectId = useAppSelector(selectActiveProject);
  const selectedTaskId = useAppSelector(selectQuickTasksSelectedTaskId);
  const searchQuery = useAppSelector(selectQuickTasksSearchQuery);
  const filtered = useAppSelector(selectFilteredTasks);

  const tasksToDisplay = useMemo(() => {
    if (!searchQuery) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(
      (t) => t.title.toLowerCase().includes(q) || idMatchesQuery(t, q),
    );
  }, [filtered, searchQuery]);

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
              if (sel.projectId) dispatch(setShowAllProjects(false));
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
        {!selectedProjectId ? (
          <div className="p-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2 mt-4">
            <Folder className="h-6 w-6 opacity-20" />
            <p>Select a project to view tasks.</p>
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
                isSelected={selectedTaskId === task.id}
                onSelect={() => dispatch(setQuickTasksSelectedTaskId(task.id))}
                onToggleComplete={() =>
                  dispatch(toggleTaskCompleteThunk({ taskId: task.id }))
                }
                hideProjectName={true}
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
  const newTaskTitle = useAppSelector(selectNewTaskTitle);
  const isCreatingTask = useAppSelector(selectIsCreatingTask);
  const {
    inputRef: quickAddInputRef,
    scheduleRefocus: scheduleQuickAddRefocus,
  } = useRefocusInputAfterAsync(isCreatingTask);
  const filtered = useAppSelector(selectFilteredTasks);
  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return filtered.find((t) => t.id === selectedTaskId) || null;
  }, [selectedTaskId, filtered]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedProjectId) return;
    const defaultScopeIds = Object.values(scopeSelections ?? {}).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const newId = await dispatch(
      createTaskThunk({
        title: newTaskTitle,
        projectId: selectedProjectId,
        organizationId: orgId,
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

        <form onSubmit={handleAddTask} className="flex gap-2 w-full max-w-sm">
          <Input
            ref={quickAddInputRef}
            value={newTaskTitle}
            onChange={(e) => dispatch(setNewTaskTitle(e.target.value))}
            placeholder="Enter new task title..."
            className="h-8 text-[13px] flex-1"
            disabled={isCreatingTask || !selectedProjectId}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 text-xs font-semibold"
            disabled={
              isCreatingTask || !newTaskTitle.trim() || !selectedProjectId
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
          </Button>
        </form>

        {!selectedProjectId && (
          <p className="text-[10px] text-destructive mt-2">
            Please select a project in the sidebar first.
          </p>
        )}
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
        onClose={() => dispatch(setQuickTasksSelectedTaskId(null))}
      />
    </div>
  );
}
