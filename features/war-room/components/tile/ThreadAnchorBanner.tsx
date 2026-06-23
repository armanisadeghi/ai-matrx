"use client";

// features/war-room/components/tile/ThreadAnchorBanner.tsx
//
// Feature 2fe48c5c — a thread should be anchored to a Task OR a Project. This is
// the affordance + the (soft) guard: a thread with NEITHER shows a quiet banner
// nudging the user to pick one, and lets them clear back. It is a WARNING, never
// a block (matching the room's resolution philosophy) — so it's dismissable for
// the session (SPEED & FOCUS: never trapped).
//
//   • Add task   → switch the thread to its Task tab; the existing "Click to add
//     a task" prompt takes over (one click to a focused title input).
//   • Link project → pick any of the user's projects (WarRoomProjectPicker),
//     resolving the room/tile project invariant via ProjectConflictDialog
//     exactly like QuickAddThread. Binding flips the tile to 'project' flavor;
//     the picker's clear reverts it (the "clear back" half of the feature).
//   • Dismiss    → silence the prompt for this thread this session.
//
// Renders nothing once the thread is anchored (task or project present) or the
// prompt was dismissed.

import { useRef, useState } from "react";
import { ListChecks, FolderKanban, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectEffectiveTileProjectId,
  selectTileFlavor,
  selectTileTaskId,
} from "@/features/war-room/redux/selectors";
import {
  checkTileProjectConflict,
  setTileProjectThunk,
  type ProjectConflictResolution,
} from "@/features/war-room/redux/thunks";
import { setTileActiveTabPersisted } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { WarRoomProjectPicker } from "../shared/WarRoomProjectPicker";
import { ProjectConflictDialog } from "../shared/ProjectConflictDialog";
import { useRoomView } from "../room/roomViewContext";

export function ThreadAnchorBanner({
  tileId,
  sessionId,
}: {
  tileId: string;
  sessionId: string;
}) {
  const dispatch = useAppDispatch();
  const flavor = useAppSelector((s) => selectTileFlavor(tileId)(s));
  const taskId = useAppSelector((s) => selectTileTaskId(tileId)(s));
  const projectId = useAppSelector((s) => selectEffectiveTileProjectId(tileId)(s));
  const { dismissedAnchorPrompts, dismissAnchorPrompt } = useRoomView();

  const otherThreadCount = useAppSelector(
    (s) => (s.warRoom.tileIdsBySession[sessionId] ?? []).length,
  );

  const [pickerOpen, setPickerOpen] = useState(false);

  // Conflict prompt state (mirrors QuickAddThread): the requested project,
  // resumed once the user resolves. The room's project is re-derived inside the
  // thunk, so we only need to remember what was requested for the dialog copy.
  const [conflictOpen, setConflictOpen] = useState(false);
  const pendingProjectRef = useRef<{ id: string; name: string | null } | null>(
    null,
  );

  // Anchored (task or project) OR dismissed ⇒ nothing to show.
  const anchored = !!taskId || !!projectId;
  if (anchored || dismissedAnchorPrompts.has(tileId)) return null;
  // Only generic threads are "unanchored"; a task/project flavored tile already
  // declares its anchor even before the task/project row lands.
  if (flavor !== "thread") return null;

  async function linkProject(
    id: string,
    resolution?: ProjectConflictResolution,
  ) {
    const ok = await dispatch(setTileProjectThunk(tileId, id, resolution));
    if (ok) {
      setPickerOpen(false);
      setConflictOpen(false);
    } else {
      toast.error("Couldn't link the project");
    }
  }

  function onPick(id: string | null, name: string | null) {
    if (!id) return; // clearing from an unanchored thread is a no-op
    const { hasConflict } = dispatch(checkTileProjectConflict(sessionId, id));
    if (hasConflict) {
      pendingProjectRef.current = { id, name };
      setConflictOpen(true);
      return;
    }
    void linkProject(id);
  }

  function onResolveConflict(resolution: ProjectConflictResolution) {
    const pending = pendingProjectRef.current;
    if (!pending) return;
    void linkProject(pending.id, resolution);
  }

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-warning/30 bg-warning/[0.06] text-[11px]">
      <AlertCircle className="size-3.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        This thread isn&apos;t anchored — give it a task or a project.
      </span>

      <button
        type="button"
        onClick={() => dispatch(setTileActiveTabPersisted(tileId, "task"))}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:border-success/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
      >
        <ListChecks className="size-3" />
        Add task
      </button>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <FolderKanban className="size-3" />
            Link project
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <p className="mb-2 text-xs font-semibold text-foreground">
            Anchor this thread to a project
          </p>
          <WarRoomProjectPicker
            value={null}
            onSelect={onPick}
            allowClear={false}
          />
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={() => dismissAnchorPrompt(tileId)}
        title="Dismiss"
        aria-label="Dismiss anchor prompt"
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X className="size-3.5" />
      </button>

      <ProjectConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        requestedProjectName={pendingProjectRef.current?.name ?? null}
        otherThreadCount={otherThreadCount}
        busy={false}
        onResolve={onResolveConflict}
      />
    </div>
  );
}
