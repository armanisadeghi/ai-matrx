"use client";

import React from "react";
import Link from "next/link";
import { X, CircleDashed, CheckCircle2, Flag } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { dissociateFromTask } from "@/features/tasks/redux/taskAssociationsSlice";
import { setSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { cn } from "@/utils/cn";

interface TaskChipProps {
  /** The task this chip represents */
  taskId: string;
  /** Optional source — enables the × dissociate affordance */
  source?: { entity_type: string; entity_id: string };
  /** Click target: "route" navigates to /tasks, "select" sets selectedTaskId. Default: route. */
  onClickMode?: "route" | "select" | "both";
  size?: "xs" | "sm" | "md";
  className?: string;
}

/**
 * Compact pill displaying a linked task. Click → open the task.
 * × on hover dissociates (if `source` provided).
 */
export default function TaskChip({
  taskId,
  source,
  onClickMode = "both",
  size = "sm",
  className,
}: TaskChipProps) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId));

  if (!task) return null;

  const completed = task.status === "completed";
  const priority = task.priority as "low" | "medium" | "high" | null;

  const dotColor =
    priority === "high"
      ? "bg-red-500"
      : priority === "medium"
        ? "bg-amber-500"
        : priority === "low"
          ? "bg-green-500"
          : "";

  const sizeCls =
    size === "xs"
      ? "h-5 text-[10px] px-1.5 gap-1"
      : size === "md"
        ? "h-7 text-xs px-2 gap-1.5"
        : "h-6 text-[11px] px-1.5 gap-1";

  const handleClick = (e: React.MouseEvent) => {
    if (onClickMode === "route") return; // let Link handle it
    e.preventDefault();
    dispatch(setSelectedTaskId(taskId));
    if (onClickMode === "both") {
      // Allow Link to also navigate
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!source) return;
    dispatch(
      dissociateFromTask({
        taskId,
        entityType: source.entity_type,
        entityId: source.entity_id,
      }),
    );
  };

  const content = (
    <span
      className={cn(
        "group inline-flex items-center rounded-full border transition-colors",
        completed
          ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
          : "border-border bg-card hover:bg-accent text-foreground",
        sizeCls,
        className,
      )}
    >
      {completed ? (
        <CheckCircle2 className="w-3 h-3 shrink-0" />
      ) : (
        <CircleDashed className="w-3 h-3 shrink-0 text-muted-foreground" />
      )}
      {priority && (
        <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
      )}
      <span
        title={task.title}
        className={cn("truncate max-w-[160px]", completed && "line-through")}
      >
        {task.title}
      </span>
      {source && (
        <button
          type="button"
          onClick={handleRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
          title="Remove link"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );

  if (onClickMode === "select") {
    return (
      <button type="button" onClick={handleClick} className="inline-flex">
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/tasks?task=${taskId}`}
      onClick={handleClick}
      className="inline-flex"
    >
      {content}
    </Link>
  );
}
