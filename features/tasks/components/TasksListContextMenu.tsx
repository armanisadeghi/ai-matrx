"use client";

import { useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createTaskThunk,
  deleteTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import { setSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
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
import type { Project, TaskWithProject } from "@/features/tasks/types";
import { toast } from "@/lib/toast";

/** The one delegated task identity anchor every desktop list renderer emits. */
export const TASK_ROW_DOM_ATTR = "data-task-row-id";

type TasksListContextMenuProps = {
  tasks: TaskWithProject[];
  projects: Project[];
  searchQuery: string;
  children: ReactNode;
};

/**
 * Canonical one-menu task-list wrapper for every desktop Tasks host.
 *
 * The menu delegates from the clicked row anchor, so the root workbench and
 * list pane execute the exact same context, entity, and task actions.
 */
export function TasksListContextMenu({
  tasks,
  projects,
  searchQuery,
  children,
}: TasksListContextMenuProps) {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectOrganizationId);
  const [menuTarget, setMenuTarget] = useState<TaskWithProject | null>(null);

  const resolveMenuTarget = (target: HTMLElement | null) => {
    const taskId =
      target
        ?.closest?.(`[${TASK_ROW_DOM_ATTR}]`)
        ?.getAttribute(TASK_ROW_DOM_ATTR) ?? null;
    const next = taskId
      ? (tasks.find((task) => task.id === taskId) ?? null)
      : null;
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

  const handleToggleTask = async (taskId: string) => {
    try {
      await dispatch(toggleTaskCompleteThunk({ taskId })).unwrap();
    } catch (error) {
      console.error("Error changing task completion:", error);
      toast.error("Could not update task completion");
    }
  };

  const handleDeleteTask = async (task: TaskWithProject) => {
    try {
      await dispatch(
        deleteTaskThunk({ taskId: task.id, projectId: task.projectId }),
      ).unwrap();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Could not delete task");
    }
  };

  const handleDuplicateTask = async (task: TaskWithProject) => {
    try {
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
          organizationId,
        }),
      ).unwrap();
      if (!newId) throw new Error("The duplicated task was not created.");
      dispatch(setSelectedTaskId(newId));
    } catch (error) {
      console.error("Error duplicating task:", error);
      toast.error("Could not duplicate task");
    }
  };

  const menuSections: ContextMenuExtraSection[] = menuTarget
    ? createTasksExtraSections({
        completed: menuTarget.completed,
        onToggleComplete: () => void handleToggleTask(menuTarget.id),
        onDelete: () => void handleDeleteTask(menuTarget),
      }).map((section) => {
        const withoutSave = section.items.filter(
          (item) => !("id" in item) || item.id !== "save",
        );
        const toggleIndex = withoutSave.findIndex(
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
        items.splice(toggleIndex + 1, 0, duplicateItem);
        return { ...section, items };
      })
    : [];

  const getApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection?.()?.toString() ?? "",
      selectionRange: null,
      contextData: buildTasksListContextData({
        tasks,
        projects,
        searchQuery,
      }),
    });

  return (
    <NonEditableContextMenu
      sourceFeature={TASKS_CONTEXT_MENU_PROPS.sourceFeature}
      surfaceName={TASKS_CONTEXT_MENU_PROPS.surfaceName}
      getApplicationScope={getApplicationScope}
      resolveContextOnOpen={resolveMenuTarget}
      extraSections={menuSections}
    >
      {children}
    </NonEditableContextMenu>
  );
}
