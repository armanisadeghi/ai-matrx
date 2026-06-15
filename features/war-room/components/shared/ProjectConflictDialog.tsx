"use client";

// features/war-room/components/shared/ProjectConflictDialog.tsx
//
// The room/tile PROJECT-conflict prompt. A room (ctx_war_room_sessions.project_id)
// and its threads can never hold CONFLICTING projects (the invariant — see
// migrations/ctx_war_room_tiles_flavor_project.sql). When the user puts a thread
// on a DIFFERENT project than the room's, this dialog offers the two (and only
// two) coherent resolutions:
//   • per-thread — keep the other threads on the room's project, give THIS one
//     its own (the room itself stops being "one project").
//   • keep-room  — drop the requested project; this thread joins the room's.
// Reusable by the create flow (QuickAddThread) and the room-project control.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, SplitSquareHorizontal, Layers } from "lucide-react";
import type { ProjectConflictResolution } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

const CHOICE_CLASS = cn(
  "group flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all",
  "hover:border-primary/50 hover:bg-primary/[0.03]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  "disabled:opacity-60 disabled:pointer-events-none",
);

export function ProjectConflictDialog({
  open,
  onOpenChange,
  roomProjectName,
  requestedProjectName,
  otherThreadCount,
  busy = false,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomProjectName?: string | null;
  requestedProjectName?: string | null;
  /** How many OTHER threads currently belong to the room's project (for copy). */
  otherThreadCount?: number;
  busy?: boolean;
  onResolve: (resolution: ProjectConflictResolution) => void;
}) {
  const room = roomProjectName?.trim() || "this room's project";
  const requested = requestedProjectName?.trim() || "a different project";
  const others =
    otherThreadCount && otherThreadCount > 0
      ? `${otherThreadCount} other ${otherThreadCount === 1 ? "thread" : "threads"}`
      : "your other threads";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>This room is set to one project</DialogTitle>
          <DialogDescription>
            This War Room is associated with{" "}
            <strong className="text-foreground">{room}</strong>, so its threads
            belong to it. You&apos;re putting this thread on{" "}
            <strong className="text-foreground">{requested}</strong>. Pick how to
            keep things consistent:
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 py-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("per-thread")}
            className={CHOICE_CLASS}
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SplitSquareHorizontal className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                Use a project per thread
              </span>
              <span className="block text-xs text-muted-foreground">
                Keep {others} on {room}, and put this thread on {requested}. The
                room itself will no longer be tied to a single project.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("keep-room")}
            className={CHOICE_CLASS}
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Layers className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                Keep one project for the whole room
              </span>
              <span className="block text-xs text-muted-foreground">
                Add this thread to {room} instead. The whole room stays one
                project.
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
