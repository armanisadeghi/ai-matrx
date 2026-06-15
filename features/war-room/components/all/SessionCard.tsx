"use client";

// features/war-room/components/all/SessionCard.tsx

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Trash2, Loader2, Clock } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteSession } from "@/features/war-room/redux/thunks";
import type { WarRoomSession } from "@/features/war-room/types";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";

export function SessionCard({ session }: { session: WarRoomSession }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  function open() {
    if (pending || deleting) return;
    startTransition(() => router.push(`/war-room/${session.id}`));
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm({
      title: "Delete this War Room?",
      description: `"${session.title}" and its tile layout will be removed. The tasks, notes, and transcripts inside stay safe in their own features.`,
      variant: "destructive",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeleting(true);
    await dispatch(deleteSession(session.id));
  }

  return (
    <div
      role="button"
      tabIndex={deleting ? -1 : 0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-disabled={deleting}
      className={cn(
        "group relative cursor-pointer text-left rounded-xl border border-border bg-card p-4",
        "transition-all hover:border-primary/40 hover:shadow-[var(--elevation-2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        deleting && "opacity-50 pointer-events-none",
        "flex flex-col gap-3 min-h-36",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid place-items-center size-9 rounded-lg bg-primary/10 text-primary shrink-0">
          <LayoutGrid className="size-4.5" />
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="grid place-items-center size-7 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
          aria-label="Delete War Room"
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {session.title}
        </h3>
        {session.description ? (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {session.description}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="size-3" />
        <span>
          {formatRelativeTime(session.last_opened_at, {
            fallback: "Never opened",
          })}
        </span>
        {pending ? (
          <Loader2 className="size-3 animate-spin ml-auto text-primary" />
        ) : null}
      </div>
    </div>
  );
}
