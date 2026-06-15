"use client";

// features/tasks/components/TaskCommentPopover.tsx
//
// Reusable task-comment surface: a compact button that opens a popover with the
// comment thread + an inline composer. Backed by ctx_task_comments via
// taskService. Built here (not in War Room) so the full task editor and any
// other surface can adopt it — there was no task-comment UI before this.

import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "sonner";
import * as taskService from "@/features/tasks/services/taskService";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";

interface TaskComment {
  id: string;
  content: string;
  created_at: string;
  user_id?: string | null;
}

export function TaskCommentPopover({
  taskId,
  className,
}: {
  taskId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await taskService.getTaskComments(taskId);
      setComments((rows ?? []) as TaskComment[]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !loaded) void load();
  }

  async function submit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const created = await taskService.createTaskComment(taskId, content);
      if (created) {
        setComments((prev) => [...prev, created as TaskComment]);
        setDraft("");
      } else {
        toast.error("Couldn't add comment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
          {loaded && comments.length > 0 ? comments.length : "Comment"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-52 overflow-y-auto p-2 space-y-2">
          {loading ? (
            <div className="grid place-items-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No comments yet
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-md bg-muted/50 px-2 py-1.5">
                <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                  {c.content}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(c.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border p-2">
          <ProTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            onSubmit={submit}
            submitLabel="Post"
            isSubmitting={submitting}
            showCopyButton={false}
            autoGrow
            minHeight={38}
            maxHeight={120}
            className="text-sm"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
