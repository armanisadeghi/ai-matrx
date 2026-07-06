"use client";

import React from "react";
import Link from "next/link";
import { Calendar, Paperclip, User, ExternalLink, Folder } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import type { TaskWithProject } from "@/features/tasks/types";
import { cn } from "@/lib/utils";

/** Aligns stacked metadata/scope rows with the title column beside the checkbox. */
const STACKED_CONTENT_INDENT = "pl-6";

export type CompactTaskItemLayout = "card" | "stacked";

interface CompactTaskItemProps {
  task: TaskWithProject;
  isSelected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
  hideProjectName?: boolean;
  /**
   * `card` — original bordered card (All Tasks, Quick Tasks sheet, /tasks).
   * `stacked` — checkbox + 2-line title on row 1; project/date/meta on row 2
   * (Quick Tasks window sidebar — avoids metadata getting squeezed beside the
   * external-link column).
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

function TaskOpenLink({ taskId }: { taskId: string }) {
  return (
    <div
      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={(e) => e.stopPropagation()}
    >
      <Link
        href={`/tasks/${taskId}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open task in full page (cmd+click from anywhere)"
        className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink size={13} />
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
    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={checked}
        onCheckedChange={onToggleComplete}
        className="mt-0.5"
      />
    </div>
  );
}

function TaskMetadata({
  task,
  hideProjectName,
  isPastDue,
  compact = false,
}: {
  task: TaskWithProject;
  hideProjectName: boolean;
  isPastDue: boolean;
  compact?: boolean;
}) {
  const textSize = compact ? "text-[10px]" : "text-xs";
  const iconSize = compact ? 10 : 12;

  return (
    <>
      {task.projectName && !hideProjectName && (
        <div
          className={cn(
            "flex items-center gap-0.5 min-w-0 max-w-full",
            compact ? "text-muted-foreground/80" : "",
          )}
        >
          {compact && <Folder size={iconSize} className="shrink-0" />}
          <span
            className={cn(
              "truncate",
              compact ? "text-muted-foreground" : "text-primary",
            )}
          >
            {task.projectName}
          </span>
        </div>
      )}

      {task.dueDate && (
        <div
          className={cn(
            "flex items-center gap-0.5 shrink-0",
            textSize,
            isPastDue
              ? "text-destructive font-medium"
              : "text-muted-foreground",
          )}
        >
          <Calendar size={iconSize} />
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
            "px-1.5 py-0.5 rounded font-medium border shrink-0",
            textSize,
            getPriorityColor(task.priority),
          )}
        >
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </div>
      )}

      {task.attachments && task.attachments.length > 0 && (
        <div
          className={cn(
            "flex items-center gap-0.5 text-muted-foreground shrink-0",
            textSize,
          )}
        >
          <Paperclip size={iconSize} />
          <span>{task.attachments.length}</span>
        </div>
      )}

      {task.assigneeName && (
        <div
          className={cn(
            "flex items-center gap-0.5 text-muted-foreground min-w-0",
            textSize,
          )}
        >
          <User size={iconSize} className="shrink-0" />
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
              "px-1.5 py-0.5 rounded font-medium shrink-0",
              textSize,
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
    <>
      <div className="flex items-start gap-2">
        <TaskCheckbox
          checked={task.completed}
          onToggleComplete={onToggleComplete}
        />

        <div className="flex-1 min-w-0 flex items-start gap-1">
          <h3
            className={cn(
              "flex-1 min-w-0 text-xs font-medium leading-snug line-clamp-2",
              task.completed
                ? "line-through text-muted-foreground"
                : "text-foreground",
            )}
          >
            {task.title}
          </h3>
          <TaskOpenLink taskId={task.id} />
        </div>
      </div>

      <div
        className={cn(
          STACKED_CONTENT_INDENT,
          "mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0",
        )}
      >
        <TaskMetadata
          task={task}
          hideProjectName={hideProjectName}
          isPastDue={isPastDue}
          compact
        />
      </div>

      <ScopeTagsDisplay
        entityType="task"
        entityId={task.id}
        className={cn(STACKED_CONTENT_INDENT, "mt-1.5")}
      />
    </>
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

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    onSelect();
  };

  return (
    <div
      className={cn(
        "group px-3 py-1.5 rounded-sm border transition-all cursor-pointer relative",
        isSelected
          ? "bg-primary/10 border-primary/30 shadow-sm"
          : "bg-card border-border hover:border-border/80 hover:shadow-sm",
      )}
      onClick={handleClick}
    >
      {layout === "stacked" ? (
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
