"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSelectedTaskId,
  selectTasksLoading,
  setSelectedTaskId,
} from "@/features/tasks/redux/taskUiSlice";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ChevronRight, Loader2 } from "lucide-react";

/**
 * Single-task focus route. Mirrors the agents builder pattern:
 *  - Header content (back chevron + label) lives in the shell glass header.
 *  - The page body is a single full-height column rendering <TaskEditor/>.
 *
 * The route param hydrates Redux's `selectedTaskId` so <TaskEditor/> picks
 * up the task without prop threading.
 */
export default function TaskPage() {
  const params = useParams();
  const taskId = params.id as string;
  const dispatch = useAppDispatch();

  useNavTree();

  const selectedId = useAppSelector(selectSelectedTaskId);
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const project = useAppSelector((s) =>
    task?.project_id && task.project_id !== "__unassigned__"
      ? selectProjectById(s, task.project_id)
      : undefined,
  );
  const loading = useAppSelector(selectTasksLoading);

  useEffect(() => {
    if (selectedId !== taskId) {
      dispatch(setSelectedTaskId(taskId));
    }
  }, [dispatch, selectedId, taskId]);

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
          <ChevronLeftTapButton
            href="/tasks"
            variant="transparent"
            ariaLabel="Back to tasks"
          />
          {/* Project breadcrumb — a DOOR, not a label. The unreachable
              TaskDetailPage showed the project name as dead text; naming it
              here without a way to reach it would be the same dead end. */}
          {project ? (
            <>
              <Link
                href={`/projects/${project.id}`}
                className="ml-2 shrink-0 max-w-[10rem] truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
                title={project.name}
              >
                {project.name}
              </Link>
              <ChevronRight
                size={14}
                className="mx-1 shrink-0 text-muted-foreground/50"
              />
            </>
          ) : null}
          <h1
            className={`text-sm font-medium text-foreground truncate ${project ? "" : "ml-2"}`}
          >
            {task?.title ?? "Task"}
          </h1>
          {task ? (
            <div className="ml-auto shrink-0 flex items-center gap-0.5">
              <ReferenceCopyButton
                referenceType="task"
                id={taskId}
                label={task.title}
                toastLabel={task.title}
                size="sm"
              />
              <TaskCopyForAiButton
                taskId={taskId}
                taskTitle={task.title}
                location="Tasks — task page"
                size="sm"
              />
            </div>
          ) : null}
        </div>
      </PageHeader>

      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {!task && loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !task ? (
          // An empty single-task read has four different causes (denied,
          // trashed, missing, signed out) — the gate resolves the true one and
          // offers the way forward instead of asserting "not found".
          <AccessGate
            token="task"
            id={taskId}
            fallbackHref="/tasks"
            fallbackLabel="Back to Tasks"
          />
        ) : (
          <TaskEditor />
        )}
      </div>
    </>
  );
}
