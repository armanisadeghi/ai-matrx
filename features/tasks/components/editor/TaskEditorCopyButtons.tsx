"use client";

// features/tasks/components/editor/TaskEditorCopyButtons.tsx
//
// The task editor's copy control — ONE dropdown, live state first.
//
// The editor's only prior affordance was `TaskCopyForAiButton`, which
// re-FETCHES the saved row through `aiExportService`. That is a LIVE-STATE
// LAW violation on a form-heavy surface: a user who has typed into the
// description and clicks "Copy for AI" hands the agent the text they just
// replaced. Here the plain click builds from the controller's `effective`
// draft overlay — exactly what is rendered — and carries an
// `unsaved_changes` diff against the saved record. The deep tree fetch is
// genuinely useful (subtasks, comments, attachments, linked notes) and is
// PRESERVED as a named variant rather than deleted, now beside the human
// Copy and JSON copy the editor never had.

import { useAppSelector } from "@/lib/redux/hooks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { selectSubtasksByParent } from "@/features/agent-context/redux/tasksSlice";
import { fetchTaskExportBundle } from "@/features/tasks/services/aiExportService";
import { serializeTaskForAi } from "@/features/tasks/utils/serializeProjectTaskForAi";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import {
  buildTaskEditorPayload,
  taskEditorHuman,
  taskEditorVariants,
  type TaskEditorCopyInput,
} from "@/features/tasks/lib/copy";
import { useTaskEditorControllerCtx } from "./TaskEditorControllerContext";

export function TaskEditorCopyButtons({
  size = "xs",
  className,
  location = "Tasks — task editor",
}: {
  size?: "xs" | "icon" | "sm";
  className?: string;
  location?: string;
}) {
  const { taskId, task, effective, isDirty, project } =
    useTaskEditorControllerCtx();
  const subtasks = useAppSelector((s) => selectSubtasksByParent(s, taskId));

  // Gathered inside the click handler, never memoized at render — the whole
  // point is that the payload reflects the keystroke before the click.
  const getInput = (): TaskEditorCopyInput => ({
    taskId,
    effective,
    saved: task ?? null,
    isDirty,
    projectName: project?.name ?? null,
    subtasks: subtasks.map((s) => ({
      id: s.id,
      title: s.title ?? "",
      status: s.status ?? null,
    })),
  });

  return (
    <TaskEditorCopyButtonsForDraft
      getInput={getInput}
      size={size}
      className={className}
      location={location}
    />
  );
}

/**
 * Shared task-editor copy control for editors whose draft state does not live
 * in TaskEditorControllerContext (currently the dedicated mobile editor).
 * The caller supplies a click-time getter so the live-state law remains true.
 */
export function TaskEditorCopyButtonsForDraft({
  getInput,
  size = "xs",
  className,
  location = "Tasks — task editor",
}: {
  getInput: () => TaskEditorCopyInput;
  size?: "xs" | "icon" | "sm";
  className?: string;
  location?: string;
}) {
  const current = getInput();

  return (
    <CopyButtons
      size={size}
      className={className}
      label={current.effective.title || "Task"}
      human={() => taskEditorHuman(getInput())}
      json={() => getInput().effective}
      agent={() => buildTaskEditorPayload(getInput())}
      agentVariant={{
        id: "this-task",
        label: current.isDirty
          ? "This task (incl. unsaved edits)"
          : "This task",
        hint: "The editor exactly as it is on screen right now",
        position: "first",
      }}
      aiVariants={taskEditorVariants({
        fullTree: async () => {
          const input = getInput();
          const bundle = await fetchTaskExportBundle(input.taskId);
          if (!bundle)
            throw recordUnavailable({
              entity: "task",
              reason: "unknown",
              recordId: input.taskId,
              token: "task",
            });
          return serializeTaskForAi(bundle, location);
        },
      })}
    />
  );
}
