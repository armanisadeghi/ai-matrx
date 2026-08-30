"use client";

// features/tasks/components/TaskCommentPopover.tsx
//
// Reusable task-comment surface: a compact button that opens a popover with
// the canonical comment thread. The thread itself is `CommentThread` from
// `@ai-matrx/associations/react` (W6 host adoption, 2026-08-30) — threaded
// replies, composer that never loses text on a failed post, edit/delete-own —
// backed by the package's `cmt_*` chokepoint via the host store. The count
// on the trigger rides the same store cache (`useComments`), so opening the
// popover and posting stay in sync everywhere the thread renders.

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@ai-matrx/design-system";
import { CommentThread, useComments } from "@ai-matrx/associations/react";
import { cn } from "@/lib/utils";

export function TaskCommentPopover({
  taskId,
  className,
}: {
  taskId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // autoLoad only once the popover has been opened — the trigger renders on
  // dense task rows and must not fan out one cmt_list per visible row.
  const thread = useComments({ token: "task", id: taskId, autoLoad: open });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            className,
          )}
          title="Comments"
        >
          <MessageSquare className="size-3.5" />
          {thread.status === "ready" && thread.comments.length > 0
            ? thread.comments.length
            : "Comment"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3 max-h-96 overflow-y-auto"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <CommentThread token="task" id={taskId} showHeader={false} />
      </PopoverContent>
    </Popover>
  );
}
