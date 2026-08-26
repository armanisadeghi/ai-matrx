"use client";

import type { ReactNode } from "react";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { buildTasksListContextData } from "@/features/tasks/agent-context/buildTasksContextData";
import {
  selectFilteredTasks,
  selectProjects,
} from "@/features/tasks/redux/selectors";
import { selectSearchQuery } from "@/features/tasks/redux/taskUiSlice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useAppSelector } from "@/lib/redux/hooks";

const SURFACE_NAME = "matrx-user/tasks";

/**
 * Publishes the list values declared by the Tasks manifest even when no task
 * editor is open. An open editor mounts a deeper runtime and correctly wins.
 */
export function TasksListSurfaceRuntime({ children }: { children: ReactNode }) {
  const tasks = useAppSelector(selectFilteredTasks);
  const projects = useAppSelector(selectProjects);
  const searchQuery = useAppSelector(selectSearchQuery);

  const getSurfaceScope = () => {
    const contextData = buildTasksListContextData({
      tasks,
      projects,
      searchQuery,
    });
    return buildApplicationScopeFromMenuContext({
      selectedText: "",
      selectionRange: null,
      contextData,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <div className="h-full min-h-0 w-full overflow-hidden">{children}</div>
    </SurfaceRuntimeProvider>
  );
}
