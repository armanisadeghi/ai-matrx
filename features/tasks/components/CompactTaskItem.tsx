"use client";

import React from "react";
import Link from "next/link";
import { Calendar, Paperclip, User, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import type { TaskWithProject } from "@/features/tasks/types";
import { cn } from "@/lib/utils";

export type CompactTaskItemLayout = "card" | "stacked";

interface CompactTaskItemProps {
  task: TaskWithProject;
  isSelected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
  hideProjectName?: boolean;
  /**
   * `card` — original bordered card (All Tasks, Quick Tasks sheet, /tasks).
   * `stacked` — row 1: checkbox + title; row 2: full-width meta beneath
   * (Quick Tasks window sidebar only).
   */
  layout?: CompactTaskItemLayout;
}

function getPriorityColor(priority: string | null | undefined) {
  switch (priority) {
    case "high":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "medium":
      return "bg-warning/10 text-warning border-warning/30";
    case "low":
      return "bg-success/10 text-success border-success/30";
    default:
      return "";
  }
}

function isTaskPastDue(task: TaskWithProject) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  return !!task.dueDate && task.dueDate < todayStr && !task.completed;
}

function TaskOpenLink({
  taskId,
  className,
}: {
  taskId: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Link
        href={`/tasks/${taskId}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open task in full page (cmd+click from anywhere)"
        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink size={12} />
      </Link>
    </div>
  );
}

function TaskCheckbox({
  checked,
  onToggleComplete,
}: {
  checked: boolean;
  onToggleComplete: () => void;
}) {
  return (
    <div className="shrink-0 pt-px" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={checked}
        onCheckedChange={onToggleComplete}
        className="size-3.5"
      />
    </div>
  );
}

function TaskMetadata({
  task,
  hideProjectName,
  isPastDue,
}: {
  task: TaskWithProject;
  hideProjectName: boolean;
  isPastDue: boolean;
}) {
  return (
    <>
      {task.projectName && !hideProjectName && (
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-primary truncate">{task.projectName}</span>
        </div>
      )}

      {task.dueDate && (
        <div
          className={cn(
            "flex items-center gap-1 shrink-0 text-xs",
            isPastDue
              ? "text-destructive font-medium"
              : "text-muted-foreground",
          )}
        >
          <Calendar size={12} />
          <span>
            {new Date(task.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      )}

      {task.priority && (
        <div
          className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium border shrink-0",
            getPriorityColor(task.priority),
          )}
        >
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </div>
      )}

      {task.attachments && task.attachments.length > 0 && (
        <div className="flex items-center gap-1 text-muted-foreground shrink-0 text-xs">
          <Paperclip size={12} />
          <span>{task.attachments.length}</span>
        </div>
      )}

      {task.assigneeName && (
        <div className="flex items-center gap-1 text-muted-foreground min-w-0 text-xs">
          <User size={12} className="shrink-0" />
          <span className="truncate">{task.assigneeName}</span>
        </div>
      )}

      {task.settings?.labels?.map((label: string) => {
        const opt = TASK_LABEL_OPTIONS.find((o) => o.value === label);
        if (!opt) return null;
        return (
          <span
            key={label}
            className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
              opt.color,
            )}
          >
            {opt.label}
          </span>
        );
      })}
    </>
  );
}

/** Compact meta row for Quick Tasks sidebar — all one size, no project icon. */
function StackedTaskMetaRow({
  task,
  hideProjectName,
  isPastDue,
}: {
  task: TaskWithProject;
  hideProjectName: boolean;
  isPastDue: boolean;
}) {
  const hasMeta =
    (task.projectName && !hideProjectName) ||
    task.dueDate ||
    task.priority ||
    (task.attachments && task.attachments.length > 0) ||
    task.assigneeName ||
    (task.settings?.labels?.length ?? 0) > 0;

  if (!hasMeta) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 w-full min-w-0 text-[10px] leading-tight text-muted-foreground">
      {task.projectName && !hideProjectName && (
        <span className="truncate min-w-0 max-w-[60%] font-normal">
          {task.projectName}
        </span>
      )}

      {task.projectName && !hideProjectName && task.dueDate && (
        <span className="text-border select-none" aria-hidden>
          ·
        </span>
      )}

      {task.dueDate && (
        <span
          className={cn(
            "shrink-0 tabular-nums",
            isPastDue && "text-destructive font-medium",
          )}
        >
          {new Date(task.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}

      {task.priority && (
        <span
          className={cn(
            "shrink-0 rounded px-1 py-px text-[9px] font-medium border",
            getPriorityColor(task.priority),
          )}
        >
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </span>
      )}

      {task.attachments && task.attachments.length > 0 && (
        <span className="shrink-0">{task.attachments.length} files</span>
      )}

      {task.assigneeName && (
        <span className="truncate min-w-0 max-w-[40%]">
          {task.assigneeName}
        </span>
      )}

      {task.settings?.labels?.map((label: string) => {
        const opt = TASK_LABEL_OPTIONS.find((o) => o.value === label);
        if (!opt) return null;
        return (
          <span
            key={label}
            className={cn("shrink-0 rounded px-1 py-px text-[9px]", opt.color)}
          >
            {opt.label}
          </span>
        );
      })}
    </div>
  );
}

function CompactTaskItemCard({
  task,
  hideProjectName,
  isPastDue,
  onToggleComplete,
}: {
  task: TaskWithProject;
  hideProjectName: boolean;
  isPastDue: boolean;
  onToggleComplete: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <TaskCheckbox
        checked={task.completed}
        onToggleComplete={onToggleComplete}
      />

      <div className="flex-1 min-w-0">
        <h3
          className={cn(
            "text-xs font-medium mb-1",
            task.completed
              ? "line-through text-muted-foreground"
              : "text-foreground",
          )}
        >
          {task.title}
        </h3>

        <div className="flex items-center gap-3 flex-wrap text-xs">
          <TaskMetadata
            task={task}
            hideProjectName={hideProjectName}
            isPastDue={isPastDue}
          />
        </div>

        <ScopeTagsDisplay
          entityType="task"
          entityId={task.id}
          className="mt-1.5"
        />
      </div>

      <TaskOpenLink taskId={task.id} />
    </div>
  );
}

function CompactTaskItemStacked({
  task,
  hideProjectName,
  isPastDue,
  onToggleComplete,
}: {
  task: TaskWithProject;
  hideProjectName: boolean;
  isPastDue: boolean;
  onToggleComplete: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {/* Row 1 — checkbox + title only */}
      <div className="flex items-start gap-2 min-w-0 pr-5">
        <TaskCheckbox
          checked={task.completed}
          onToggleComplete={onToggleComplete}
        />
        <h3
          className={cn(
            "flex-1 min-w-0 text-[13px] font-medium leading-snug line-clamp-2",
            task.completed
              ? "line-through text-muted-foreground"
              : "text-foreground",
          )}
        >
          {task.title}
        </h3>
      </div>

      {/* Row 2 — full card width, not indented under checkbox */}
      <StackedTaskMetaRow
        task={task}
        hideProjectName={hideProjectName}
        isPastDue={isPastDue}
      />

      <ScopeTagsDisplay
        entityType="task"
        entityId={task.id}
        className="mt-0.5 [&>*]:h-[18px] [&>*]:text-[9px] [&>*]:px-1.5"
      />

      <TaskOpenLink taskId={task.id} className="absolute top-1.5 right-1.5" />
    </div>
  );
}

export default function CompactTaskItem({
  task,
  isSelected,
  onSelect,
  onToggleComplete,
  hideProjectName = false,
  layout = "card",
}: CompactTaskItemProps) {
  const isPastDue = isTaskPastDue(task);
  const isStacked = layout === "stacked";

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    onSelect();
  };

  return (
    <div
      className={cn(
        "group transition-all cursor-pointer relative",
        isStacked
          ? cn(
              "px-2 py-2 rounded-md border",
              isSelected
                ? "bg-primary/[0.08] border-primary/25"
                : "bg-card/50 border-border/50 hover:bg-accent/30 hover:border-border",
            )
          : cn(
              "px-3 py-1.5 rounded-sm border",
              isSelected
                ? "bg-primary/10 border-primary/30 shadow-sm"
                : "bg-card border-border hover:border-border/80 hover:shadow-sm",
            ),
      )}
      onClick={handleClick}
    >
      {isStacked ? (
        <CompactTaskItemStacked
          task={task}
          hideProjectName={hideProjectName}
          isPastDue={isPastDue}
          onToggleComplete={onToggleComplete}
        />
      ) : (
        <CompactTaskItemCard
          task={task}
          hideProjectName={hideProjectName}
          isPastDue={isPastDue}
          onToggleComplete={onToggleComplete}
        />
      )}
    </div>
  );
}
