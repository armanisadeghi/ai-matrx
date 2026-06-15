"use client";

import React from "react";
import Link from "next/link";
import {
  Circle,
  CheckCircle,
  Calendar,
  Flag,
  Paperclip,
  User,
  ExternalLink,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";

interface CompactTaskItemProps {
  task: any;
  isSelected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
  hideProjectName?: boolean; // Hide project name when already shown in context (e.g., AllTasksView)
}

export default function CompactTaskItem({
  task,
  isSelected,
  onSelect,
  onToggleComplete,
  hideProjectName = false,
}: CompactTaskItemProps) {
  // Check if task is past due - compare dates consistently
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const isPastDue = task.dueDate && task.dueDate < todayStr && !task.completed;

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800";
      case "medium":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      case "low":
        return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800";
      default:
        return "";
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Let cmd/ctrl+click open the full page naturally via the Link
    if (e.metaKey || e.ctrlKey) return;
    onSelect();
  };

  return (
    <div
      className={`group px-3 py-2.5 rounded-lg border transition-all cursor-pointer relative ${
        isSelected
          ? "bg-primary/10 border-primary/30 shadow-sm"
          : "bg-card border-border hover:border-border/80 hover:shadow-sm"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={task.completed}
            onCheckedChange={onToggleComplete}
            className="mt-0.5"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3
            className={`text-sm font-medium mb-1 ${
              task.completed
                ? "line-through text-muted-foreground"
                : "text-foreground"
            }`}
          >
            {task.title}
          </h3>

          {/* Metadata */}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {/* Due Date */}
            {task.dueDate && (
              <div
                className={`flex items-center gap-1 ${
                  isPastDue
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                }`}
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

            {/* Project */}
            {task.projectName && !hideProjectName && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="text-primary">● {task.projectName}</span>
              </div>
            )}

            {/* Priority */}
            {task.priority && (
              <div
                className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getPriorityColor(task.priority)}`}
              >
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </div>
            )}

            {/* Attachments */}
            {task.attachments && task.attachments.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Paperclip size={12} />
                <span>{task.attachments.length}</span>
              </div>
            )}

            {/* Assignee */}
            {task.assigneeName && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <User size={12} />
                <span>{task.assigneeName}</span>
              </div>
            )}

            {/* Labels */}
            {task.settings?.labels?.map((label: string) => {
              const opt = TASK_LABEL_OPTIONS.find((o) => o.value === label);
              if (!opt) return null;
              return (
                <span
                  key={label}
                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${opt.color}`}
                >
                  {opt.label}
                </span>
              );
            })}
          </div>

          {/* Scope tags */}
          <ScopeTagsDisplay
            entityType="task"
            entityId={task.id}
            className="mt-1.5"
          />
        </div>

        {/* Open full page button (visible on hover) */}
        <div
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/tasks/${task.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open task in full page (cmd+click from anywhere)"
            className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
