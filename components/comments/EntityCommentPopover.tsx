"use client";

// components/comments/EntityCommentPopover.tsx
//
// The compact comment surface for ANY commentable record: a small trigger
// (live count, or "Comment") that opens the canonical thread in a popover.
// The thread is `CommentThread` from `@ai-matrx/associations/react` —
// threaded replies, a composer that never loses text on a failed post,
// edit/delete-own — over the package's `cmt_*` chokepoint; the count rides the
// same store cache (`useComments`), so every mount stays in sync. Tasks,
// board notes and any other record type use this one component.

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { CommentThread, useComments } from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { cn } from "@/lib/utils";

export function EntityCommentPopover({
  token,
  id,
  className,
}: {
  token: EntityTypeToken;
  id: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // autoLoad only once opened — the trigger renders on dense rows and tiles
  // and must not fan out one cmt_list per visible record.
  const thread = useComments({ token, id, autoLoad: open });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
          title="Comments"
        >
          <MessageSquare className="size-3.5" />
          {thread.status === "ready" && thread.comments.length > 0 ? thread.comments.length : "Comment"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        className="max-h-96 overflow-y-auto p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <CommentThread token={token} id={id} showHeader={false} />
      </PopoverContent>
    </Popover>
  );
}
