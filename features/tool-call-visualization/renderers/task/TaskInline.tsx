"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  CircleDashed,
  Flag,
  Calendar,
  PanelRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { formatDateOnly } from "@/utils/dateOnly";
import type { ToolRendererProps } from "../../types";
import { parseSingleTask } from "./parseTask";

/**
 * Inline renderer for the `task` tool (a real ctx_tasks row). Loads the live
 * task (`useEnsureTaskLoaded`) and shows a compact card, falling back to the
 * tool result's fields while it loads. Opens the canonical task editor in a
 * window (`useOpenTaskEditorWindow`) or the `/tasks/[id]` route in a new tab.
 */

function statusKind(status: string | null | undefined): "done" | "doing" | "open" {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "done" || s === "complete") return "done";
  if (s === "in_progress" || s === "in progress" || s === "doing") return "doing";
  return "open";
}

function StatusIcon({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const kind = statusKind(status);
  if (kind === "done")
    return <CheckCircle2 className={cn("text-success", className)} />;
  if (kind === "doing")
    return <CircleDashed className={cn("text-primary", className)} />;
  return <Circle className={cn("text-muted-foreground", className)} />;
}

const PRIORITY_TONE: Record<string, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-muted-foreground",
};

export function TaskInline({ entry }: ToolRendererProps) {
  const parsed = useMemo(() => parseSingleTask(entry), [entry]);
  const taskId = parsed.id;
  const { task } = useEnsureTaskLoaded(taskId ?? "");
  const openWindow = useOpenTaskEditorWindow();

  if (!taskId) return null;

  const title = task?.title ?? parsed.title ?? "Task";
  const status = task?.status ?? parsed.status;
  const priority = (task?.priority ?? parsed.priority)?.toLowerCase() ?? null;
  const due = task?.due_date ?? null;
  const description = task?.description ?? null;
  const href = `/tasks/${taskId}`;
  const kind = statusKind(status);

  return (
    <div
      className={cn(
        "rounded-lg border border-border border-l-[3px] bg-card px-3 py-2",
        kind === "done"
          ? "border-l-success"
          : kind === "doing"
            ? "border-l-primary"
            : "border-l-border",
      )}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={status} className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium text-foreground",
                kind === "done" && "text-muted-foreground line-through",
              )}
            >
              {title}
            </span>
            {priority ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium capitalize",
                  PRIORITY_TONE[priority] ?? "text-muted-foreground",
                )}
              >
                <Flag className="h-3 w-3" />
                {priority}
              </span>
            ) : null}
          </div>
          {due ? (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{formatDateOnly(due)}</span>
            </div>
          ) : null}
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => openWindow({ taskId })}
          >
            <PanelRight className="h-3.5 w-3.5" />
            Open in window
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              New tab
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
