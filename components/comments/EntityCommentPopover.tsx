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
//
// On a page with an agent chat (the Board), "With next message" sends each
// comment posted here along with the person's next message, naming the
// record (`comment c5 on task “Ship pricing page”`) — `comment-remarks.tsx`.

import { type ReactNode, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useComments } from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { cn } from "@/lib/utils";
import { RecordCommentThread } from "@/features/rich-document/annotations/comment-remarks";

export function EntityCommentPopover({
  token,
  id,
  title,
  note,
  part,
  showCount = true,
  className,
}: {
  token: EntityTypeToken;
  id: string;
  /** The record's name as the person sees it — what a staged remark names. */
  title?: string | null;
  /** One short line above the thread (e.g. where these comments are kept). */
  note?: ReactNode;
  /** The thread is about ONE PART of the record (a board tile): only its comments, stored with a `part_anchor`. */
  part?: { key: string; label: string };
  /** Show the thread's count on the trigger (off when the thread is shared, e.g. the board's). */
  showCount?: boolean;
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
            "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
          title="Comments"
          data-comment-door={part ? `${token}:${id}:${part.key}` : `${token}:${id}`}
        >
          <MessageSquare className="size-3.5" />
          {showCount && thread.status === "ready" && thread.comments.length > 0 ? thread.comments.length : <span className="max-sm:sr-only">Comment</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        className="max-h-96 overflow-y-auto p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {note ? <p className="mb-2 truncate text-xs text-muted-foreground">{note}</p> : null}
        <RecordCommentThread token={token} id={id} title={title ?? null} part={part} showHeader={false} />
      </PopoverContent>
    </Popover>
  );
}
