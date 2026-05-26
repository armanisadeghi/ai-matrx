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
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            {task?.title ?? "Task"}
          </h1>
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
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              Task not found
            </h2>
            <p className="text-sm text-muted-foreground">
              The task{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {taskId}
              </code>{" "}
              could not be found.
            </p>
            <Button asChild variant="outline">
              <Link href="/tasks">
                <ArrowLeft size={16} className="mr-2" />
                Back to Tasks
              </Link>
            </Button>
          </div>
        ) : (
          <TaskEditor />
        )}
      </div>
    </>
  );
}
