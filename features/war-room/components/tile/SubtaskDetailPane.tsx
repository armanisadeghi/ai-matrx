"use client";

/**
 * SubtaskDetailPane
 *
 * The in-tile detail surface for a single subtask. Slides in beside (wide
 * tiles) or below (narrow tiles) the parent task editor when a subtask is
 * opened from the `SubtaskRail`. It reuses the canonical `TaskEditor` — the
 * exact same real task editing the parent task uses — bound to the subtask's
 * id, so the subtask gets its own editable title / description / priority /
 * due / assignee / nested subtasks / attachments / comments.
 *
 * The only bespoke chrome is a slim header: a back affordance (close the
 * pane), the subtask title for orientation, and an "Open in window" escape
 * hatch that pops the same editor out into a floating `WindowPanel` (handled
 * by the parent via `onOpenInWindow`).
 */

import { ChevronLeft, ListChecks, PanelRightOpen, X } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";

export function SubtaskDetailPane({
  subtaskId,
  onClose,
  onOpenInWindow,
  compact,
}: {
  subtaskId: string;
  onClose: () => void;
  onOpenInWindow: () => void;
  compact?: boolean;
}) {
  const title = useAppSelector(
    (s) => selectTaskById(s, subtaskId)?.title || "Subtask",
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Slim orientation header — distinct from the editor's own title row. */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 bg-card/50 pl-1 pr-1.5">
        <button
          type="button"
          onClick={onClose}
          title="Back to task"
          aria-label="Back to task"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ListChecks className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
        <button
          type="button"
          onClick={onOpenInWindow}
          title="Open in floating window"
          aria-label="Open in floating window"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelRightOpen className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close subtask"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* The REAL editor, bound to this subtask. */}
      <div className="min-h-0 flex-1">
        <TaskEditor
          taskId={subtaskId}
          embedded
          compact={compact}
          key={subtaskId}
        />
      </div>
    </div>
  );
}
