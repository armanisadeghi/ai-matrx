"use client";

/**
 * ConversationTrashSection — the restorable trash every conversation list carries.
 *
 * DD-179. Deleting a conversation soft-deletes it (`deleted_at`), and until now
 * that was indistinguishable from destruction: the row left every list and no
 * surface could ever show it again. This is the disclosure that closes it —
 * closed by default (a deleted row is never beside a live one), one click to
 * open, Restore on every row.
 *
 * It is deliberately the SAME SHAPE as the archived-items law's
 * `ArchivedDisclosure` — closed default, one click, rows beside their own verb —
 * without being it: that control is for ARCHIVED rows, which stay reachable, and
 * the law is explicit that archived ≠ deleted. Reusing it here would mix the two
 * states in one control and make "Archived only" mean two different things.
 *
 * One component, mounted by every conversation list, so the trash cannot drift
 * per surface.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchTrashedConversations,
  restoreConversation,
} from "@/features/agents/redux/conversation-list/conversation-trash.thunks";

interface ConversationTrashSectionProps {
  /** `"consumer"` matches the comfortable /chat sidebar; `"dense"` the rest. */
  variant?: "dense" | "consumer";
  className?: string;
}

export function ConversationTrashSection({
  variant = "dense",
  className,
}: ConversationTrashSectionProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const ids = useAppSelector(
    (state) => state.conversationList.trashConversationIds,
  );
  const bodies = useAppSelector(
    (state) => state.conversationList.trashByConversationId,
  );
  const status = useAppSelector((state) => state.conversationList.trashStatus);
  const error = useAppSelector((state) => state.conversationList.trashError);

  // The trash is read only when it is opened — a list never pays for it.
  useEffect(() => {
    if (open && status === "idle") {
      void dispatch(fetchTrashedConversations());
    }
  }, [open, status, dispatch]);

  const handleRestore = useCallback(
    async (conversationId: string) => {
      setRestoringId(conversationId);
      const result = await dispatch(restoreConversation({ conversationId }));
      setRestoringId(null);
      if (restoreConversation.rejected.match(result)) {
        toast.error(result.payload?.message ?? "Restore failed");
      } else {
        toast.success("Conversation restored");
      }
    },
    [dispatch],
  );

  const dense = variant === "dense";

  return (
    <div className={cn("shrink-0 border-t border-border/60", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1.5 px-3 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          dense ? "h-6 text-[11px]" : "h-8 text-xs",
        )}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Trash2 className="h-3 w-3 shrink-0" />
        <span className="font-medium">Trash</span>
        {open && status === "succeeded" && (
          <span className="ml-auto tabular-nums text-muted-foreground/70">
            {ids.length}
          </span>
        )}
      </button>

      {open && (
        <div className="pb-1">
          {status === "loading" && (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Opening the trash…
            </div>
          )}

          {status === "failed" && (
            <p className="px-3 py-2 text-[11px] text-destructive">
              {error ?? "The trash could not be read."}
            </p>
          )}

          {status === "succeeded" && ids.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Nothing deleted. Deleted conversations land here and can be
              restored.
            </p>
          )}

          {ids.map((id) => {
            const conv = bodies[id];
            if (!conv) return null;
            const title = conv.title?.trim() || "Untitled";
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center gap-2 px-3",
                  dense ? "h-6" : "h-8",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-muted-foreground",
                    dense ? "text-[11px]" : "text-xs",
                  )}
                  title={title}
                >
                  {title}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRestore(id)}
                  disabled={restoringId === id}
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                  aria-label={`Restore ${title}`}
                >
                  {restoringId === id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="h-3 w-3" />
                  )}
                  Restore
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConversationTrashSection;
