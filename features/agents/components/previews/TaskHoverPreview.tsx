"use client";

/**
 * Lightweight hover preview for a single task. Reads from Redux directly —
 * no fetch — because tasks referenced in a message are essentially always
 * already loaded into the tasks slice.
 */

import { useState } from "react";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectTaskById,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import {
  Calendar,
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";

const DESCRIPTION_PREVIEW_CHARS = 400;

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  open: "bg-muted text-muted-foreground",
  "in-progress": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  in_progress: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  blocked: "bg-destructive/15 text-destructive",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 dark:text-red-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted-foreground",
};

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

interface TaskPreviewContentProps {
  taskId: string;
  onOpen?: () => void;
}

export function TaskPreviewContent({ taskId, onOpen }: TaskPreviewContentProps) {
  const task = useAppSelector(
    (state) =>
      selectTaskById(state as Parameters<typeof selectTaskById>[0], taskId) as
        | TaskRecord
        | undefined,
  );
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(taskId);
      setCopied(true);
      toast.success("Task ID copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!task) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Task not loaded.
      </div>
    );
  }

  const title = task.title?.trim() || "Untitled task";
  const description = task.description ?? "";
  const truncatedDesc =
    description.length > DESCRIPTION_PREVIEW_CHARS
      ? description.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd() + "…"
      : description;
  const statusKey = (task.status ?? "").toLowerCase();
  const priorityKey = (task.priority ?? "").toLowerCase();
  const dueDate = formatDate(task.due_date);
  const openHref = `/tasks/${taskId}`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <CheckSquare className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground line-clamp-2">
            {title}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        {task.status && (
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded font-semibold capitalize",
              STATUS_COLORS[statusKey] ?? "bg-muted text-muted-foreground",
            )}
          >
            {task.status}
          </span>
        )}
        {task.priority && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium capitalize bg-muted",
              PRIORITY_COLORS[priorityKey] ?? "text-muted-foreground",
            )}
          >
            <Flag className="w-2.5 h-2.5" />
            {task.priority}
          </span>
        )}
        {dueDate && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            <Calendar className="w-2.5 h-2.5" />
            {dueDate}
          </span>
        )}
      </div>

      {truncatedDesc && (
        <p className="text-xs text-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {truncatedDesc}
        </p>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleCopyId}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Copied" : "Copy ID"}
        </Button>
        <div className="ml-auto">
          {onOpen ? (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={onOpen}
            >
              <ExternalLink />
              Open
            </Button>
          ) : (
            <Link href={openHref} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="h-7 px-2.5 text-xs gap-1">
                <ExternalLink />
                Open
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface TaskHoverPreviewProps {
  taskId: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onOpen?: () => void;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function TaskHoverPreview({
  taskId,
  children,
  side = "top",
  align = "start",
  onOpen,
  openDelay = 250,
  closeDelay = 140,
  className,
}: TaskHoverPreviewProps) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 p-3 bg-card border border-border shadow-lg",
          className,
        )}
      >
        <TaskPreviewContent taskId={taskId} onOpen={onOpen} />
      </HoverCardContent>
    </HoverCard>
  );
}
