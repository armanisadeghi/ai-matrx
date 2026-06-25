"use client";

// features/war-room/components/all/SessionCard.tsx

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Clock, Inbox } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteSession } from "@/features/war-room/redux/thunks";
import { UNASSIGNED_ROOM_TITLE } from "@/features/war-room/constants";
import {
  roomColorOf,
  roomIconOf,
} from "@/features/war-room/components/room/roomIdentity";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";
import type { WarRoomSession } from "@/features/war-room/types";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";

export function SessionCard({ session }: { session: WarRoomSession }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  // The per-user "Unassigned threads" holding room is shown distinctly (inbox
  // glyph, explanatory subtitle) and is NOT deletable — it's the holding area,
  // not a normal room.
  const isHolding = session.title === UNASSIGNED_ROOM_TITLE;

  // Room branding — the chosen icon + color (safe defaults when unset) make
  // each room visually distinct in the gallery.
  const RoomIcon = isHolding ? Inbox : roomIconOf(session.icon);
  const roomColor = roomColorOf(session.color);

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
    try {
      await dispatch(deleteSession(session.id));
    } catch (err) {
      // The thunk handles its own failure toast/recovery; this guards the rare
      // dispatch-level throw so the spinner/disabled state ALWAYS resets.
      reportWarRoomError("SessionCard.delete", err);
    } finally {
      setDeleting(false);
    }
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
        "group relative cursor-pointer text-left overflow-hidden rounded-xl border border-border bg-card p-4 pl-5",
        "transition-all hover:border-primary/40 hover:shadow-[var(--elevation-2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        deleting && "opacity-50 pointer-events-none",
        "flex flex-col gap-3 min-h-36",
      )}
    >
      {/* Colored accent spine — the room's identity color, runs the card's height. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1.5",
          roomColor.swatch,
        )}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid place-items-center size-9 shrink-0 rounded-lg",
            roomColor.tint,
            roomColor.text,
          )}
        >
          <RoomIcon className="size-4.5" />
        </span>
        {isHolding ? null : (
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
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {session.title}
        </h3>
        {isHolding ? (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            Threads with no room — open to move them into one.
          </p>
        ) : session.description ? (
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
