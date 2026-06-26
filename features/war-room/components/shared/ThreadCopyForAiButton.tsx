"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { ProjectCopyForAiButton } from "@/features/projects/components/ProjectCopyForAiButton";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import {
  selectEffectiveThreadProjectId,
  selectThreadPickerOption,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";

export type ThreadCopyForAiTarget =
  | { kind: "project"; id: string; name?: string }
  | { kind: "task"; id: string; name?: string };

/** Resolves which entity a tile's "Copy for AI" action should export. */
export function useThreadCopyForAiTarget(
  threadId: string,
): ThreadCopyForAiTarget | null {
  const flavor = useAppSelector((s) => selectThreadPickerOption(threadId)(s));
  const projectId = useAppSelector((s) =>
    selectEffectiveThreadProjectId(threadId)(s),
  );
  const projectName = useAppSelector((s) =>
    projectId ? selectProjectById(s, projectId)?.name : undefined,
  );
  const taskId = useAppSelector((s) => selectThreadTaskId(threadId)(s));
  const taskTitle = useAppSelector((s) =>
    taskId ? selectTaskById(s, taskId)?.title : undefined,
  );

  if (flavor === "project" && projectId) {
    return { kind: "project", id: projectId, name: projectName };
  }

  if (taskId) {
    return { kind: "task", id: taskId, name: taskTitle };
  }

  return null;
}

/**
 * Standard "Copy for AI" control for any War Room tile — project-flavor tiles
 * export the full project tree; task/thread tiles export the anchored task.
 */
export function ThreadCopyForAiButton({
  threadId,
  size = "icon",
  className,
  locationPrefix = "War Room",
  showLabel,
}: {
  threadId: string;
  size?: "icon" | "sm";
  className?: string;
  locationPrefix?: string;
  showLabel?: boolean;
}) {
  const target = useThreadCopyForAiTarget(threadId);

  if (!target) return null;

  if (target.kind === "project") {
    return (
      <ProjectCopyForAiButton
        projectId={target.id}
        projectName={target.name}
        location={`${locationPrefix} — project tile`}
        size={size}
        className={className}
        showLabel={showLabel ?? size === "sm"}
      />
    );
  }

  return (
    <TaskCopyForAiButton
      taskId={target.id}
      taskTitle={target.name}
      location={`${locationPrefix} — task tile`}
      size={size}
      className={className}
      showLabel={showLabel ?? size === "sm"}
    />
  );
}
