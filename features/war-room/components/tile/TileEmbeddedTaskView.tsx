"use client";

/**
 * TileEmbeddedTaskView — one TaskEditor surface for any task depth (parent,
 * child, subtask). Subtask rail drills in-place; back pops the stack.
 */

import { useState } from "react";
import { ListTree } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { cn } from "@/lib/utils";
import { TileDrillHeader, type DrillSegment } from "./TileDrillHeader";
import { SubtaskRail } from "./SubtaskRail";

export function TileEmbeddedTaskView({
  taskId,
  projectId,
  compact,
  drillStack,
  rootSegment,
  onBack,
  onPopToRoot,
  onPopTo,
  onDrillTask,
}: {
  taskId: string;
  projectId: string | null;
  compact?: boolean;
  /** Task ids pushed on top of the root context (project or anchor task). */
  drillStack: string[];
  rootSegment: DrillSegment;
  onBack: () => void;
  onPopToRoot: () => void;
  onPopTo: (index: number) => void;
  onDrillTask: (taskId: string) => void;
}) {
  const openTaskWindow = useOpenTaskEditorWindow();
  const [railOpen, setRailOpen] = useState(false);
  const [railAutoFocus, setRailAutoFocus] = useState(false);

  const drillTitles = useAppSelector((s) =>
    drillStack.map((id) => selectTaskById(s, id)?.title?.trim() || "Task"),
  );

  const segments: DrillSegment[] = [
    { label: rootSegment.label, onClick: onPopToRoot },
    ...drillStack.map((id, index) => ({
      label: drillTitles[index] ?? "Task",
      onClick: index < drillStack.length - 1 ? () => onPopTo(index) : undefined,
    })),
  ];

  const showRail = railOpen;

  return (
    <div className="flex h-full min-h-0 flex-col @container/task">
      <TileDrillHeader segments={segments} onBack={onBack} compact={compact} />

      <div className="flex min-h-0 flex-1 @[34rem]/task:flex-row">
        <div className="min-h-0 min-w-0 flex-1">
          <TaskEditor
            taskId={taskId}
            embedded
            compact={compact}
            key={taskId}
            onOpenLinkedTask={onDrillTask}
            footerAppend={
              <Button
                type="button"
                size="sm"
                variant={showRail ? "secondary" : "ghost"}
                onClick={() => {
                  if (showRail) {
                    setRailOpen(false);
                    setRailAutoFocus(false);
                  } else {
                    setRailOpen(true);
                    setRailAutoFocus(true);
                  }
                }}
                className="h-6 w-6 shrink-0 p-0"
                aria-pressed={showRail}
                title={showRail ? "Hide subtasks" : "Add / open subtasks"}
                aria-label={showRail ? "Hide subtasks" : "Add / open subtasks"}
              >
                <ListTree className="size-3.5" />
              </Button>
            }
          />
        </div>

        {showRail ? (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col border-t border-border/60",
              "max-h-[55%] shrink-0 @[34rem]/task:max-h-none @[34rem]/task:w-72 @[34rem]/task:shrink-0 @[34rem]/task:border-l @[34rem]/task:border-t-0",
            )}
          >
            <SubtaskRail
              taskId={taskId}
              projectId={projectId}
              onOpenPane={onDrillTask}
              onOpenWindow={(id) => openTaskWindow({ taskId: id })}
              autoFocus={railAutoFocus}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
