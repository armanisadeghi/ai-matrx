"use client";

import React, { useCallback } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  QuickTasksWorkspaceProvider,
  QuickTasksSidebar,
  QuickTasksMain,
  filterQuickTasksByOrg,
  filterQuickTasksBySearch,
} from "@/features/tasks/components/QuickTasksWorkspace";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  QUICK_TASKS_SURFACE_NAME,
  createQuickTasksScope,
  type QuickTasksVisibleTaskEntry,
} from "@/features/surfaces/manifests/quick-tasks.manifest";
import { useAppStore } from "@/lib/redux/hooks";
import { selectAllTasks } from "@/features/agent-context/redux/tasksSlice";
import {
  selectFilteredTasks,
  UNASSIGNED_PROJECT_ID,
} from "@/features/tasks/redux/selectors";
import {
  selectActiveProject,
  selectShowAllProjects,
  selectNewTaskTitle,
} from "@/features/tasks/redux/taskUiSlice";
import {
  selectQuickTasksSelectedOrgId,
  selectQuickTasksSelectedTaskId,
  selectQuickTasksSearchQuery,
} from "@/features/tasks/redux/quickTasksWindowSlice";

interface QuickTasksWindowProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function QuickTasksWindow({
  isOpen,
  onClose,
}: QuickTasksWindowProps) {
  // Surface emitter (`matrx-user/quick-tasks`): reads live store state at
  // trigger time. Nested inside the hosting page's provider on purpose —
  // while the window is open, its scope out-depths (and therefore wins over)
  // the page's surface (deepest wins, by design).
  const store = useAppStore();
  const getScope = useCallback(() => {
    const s = store.getState();
    const selectedOrgId = selectQuickTasksSelectedOrgId(s);
    const activeProject = selectActiveProject(s);
    const searchQuery = selectQuickTasksSearchQuery(s);
    const selectedTaskId = selectQuickTasksSelectedTaskId(s);

    // Same two filters the sidebar applies — agents see what the user sees.
    const orgScoped = filterQuickTasksByOrg(
      selectFilteredTasks(s),
      selectAllTasks(s),
      selectedOrgId,
    );
    const visible = filterQuickTasksBySearch(orgScoped, searchQuery);

    const visibleTasks: QuickTasksVisibleTaskEntry[] = visible.map((t) => ({
      id: t.id,
      title: t.title,
      completed: t.completed,
      priority: t.priority ?? null,
      due_date: t.dueDate,
      project_id: t.projectId,
      project_name: t.projectName,
    }));

    const selected = selectedTaskId
      ? (visible.find((t) => t.id === selectedTaskId) ?? null)
      : null;

    return createQuickTasksScope({
      show_all_projects: selectShowAllProjects(s),
      search_query: searchQuery,
      visible_tasks: visibleTasks,
      visible_task_count: visibleTasks.length,
      new_task_title: selectNewTaskTitle(s),
      selected_org_id: selectedOrgId ?? undefined,
      selected_project_id:
        activeProject && activeProject !== UNASSIGNED_PROJECT_ID
          ? activeProject
          : undefined,
      selected_task_id: selectedTaskId ?? undefined,
      selected_task_summary: selected
        ? {
            id: selected.id,
            title: selected.title,
            completed: selected.completed,
            description: selected.description,
            priority: selected.priority ?? null,
            due_date: selected.dueDate,
            project_id: selected.projectId,
            project_name: selected.projectName,
          }
        : undefined,
    });
  }, [store]);

  if (!isOpen) return null;

  return (
    <QuickTasksWorkspaceProvider>
      <SurfaceRuntimeProvider
        surfaceName={QUICK_TASKS_SURFACE_NAME}
        getScope={getScope}
      >
        <WindowPanel
          title="Quick Tasks"
          width={850}
          height={650}
          sidebar={<QuickTasksSidebar />}
          sidebarDefaultSize={300}
          sidebarMinSize={225}
          sidebarClassName="bg-muted/10 border-r"
          urlSyncKey="quick_tasks"
          onClose={onClose}
          overlayId="quickTasksWindow"
        >
          <QuickTasksMain />
        </WindowPanel>
      </SurfaceRuntimeProvider>
    </QuickTasksWorkspaceProvider>
  );
}
