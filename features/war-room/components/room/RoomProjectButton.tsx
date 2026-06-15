"use client";

// features/war-room/components/room/RoomProjectButton.tsx
//
// Room-level PROJECT association control in the header. Lets the user tie the
// WHOLE room to a project (so every thread belongs to it), see the current
// mode, or clear it. Enforces the invariant (a room and its threads never hold
// conflicting projects):
//   • setting a project while some thread carries a DIFFERENT one prompts to
//     move them all onto it (absorbRoomIntoProjectThunk).
//   • 'per-thread' mode (threads carry their own, room has none) is shown as
//     such; clearing/just-reading never forces a change.
// Writes only the ctx_war_room_* rows — never appContextSlice.

import { FolderKanban, ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSessionProjectId,
  selectSessionProjectMode,
} from "@/features/war-room/redux/selectors";
import {
  setRoomProjectThunk,
  absorbRoomIntoProjectThunk,
} from "@/features/war-room/redux/thunks";
import { useUserProjects } from "@/features/projects/hooks";
import { cn } from "@/lib/utils";
import { WarRoomProjectPicker } from "../shared/WarRoomProjectPicker";

export function RoomProjectButton({ sessionId }: { sessionId: string }) {
  const { projects } = useUserProjects();

  const roomProjectId = useAppSelector(selectSessionProjectId(sessionId));
  const mode = useAppSelector(selectSessionProjectMode(sessionId));
  const roomProjectName =
    (roomProjectId && projects.find((p) => p.id === roomProjectId)?.name) ||
    null;

  const label =
    mode === "room"
      ? roomProjectName || "Project"
      : mode === "per-thread"
        ? "Per-thread"
        : "Link project";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-7 text-xs font-medium transition-colors max-w-[12rem]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            mode === "room"
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
          aria-label="Room project"
          title="Associate this whole War Room with a project"
        >
          <FolderKanban className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <RoomProjectPicker
          sessionId={sessionId}
          roomProjectId={roomProjectId}
          mode={mode}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The popover body — separated so it can read the live tiles via a selector at
 * choose-time (to detect per-thread conflicts) without the trigger re-rendering
 * on every tile change.
 */
function RoomProjectPicker({
  sessionId,
  roomProjectId,
  mode,
}: {
  sessionId: string;
  roomProjectId: string | null;
  mode: "room" | "per-thread" | "none";
}) {
  const dispatch = useAppDispatch();
  // Tiles for this session — to find threads on a different project.
  const tileIds = useAppSelector(
    (s) => s.warRoom.tileIdsBySession[sessionId] ?? EMPTY,
  );
  const tilesById = useAppSelector((s) => s.warRoom.tilesById);

  async function choose(id: string | null) {
    if (!id) {
      if (roomProjectId) await dispatch(setRoomProjectThunk(sessionId, null));
      return;
    }
    if (id === roomProjectId) return;

    const conflicting = tileIds.filter((tid) => {
      const p = tilesById[tid]?.project_id;
      return p && p !== id;
    });

    if (conflicting.length > 0) {
      const ok = await confirm({
        title: "Set the whole room to this project?",
        description: `${conflicting.length} thread${
          conflicting.length === 1 ? "" : "s"
        } currently use a different project. They'll move to this one.`,
        confirmLabel: "Set room project",
      });
      if (!ok) return;
      await dispatch(absorbRoomIntoProjectThunk(sessionId, id));
      return;
    }
    await dispatch(setRoomProjectThunk(sessionId, id));
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-xs font-semibold text-foreground">Room project</p>
        <p className="text-[11px] text-muted-foreground">
          {mode === "per-thread"
            ? "Threads currently use their own projects. Pick one to make the whole room a single project."
            : "Tie this whole room to a project — every thread belongs to it."}
        </p>
      </div>
      <WarRoomProjectPicker
        value={roomProjectId}
        onSelect={(id) => void choose(id)}
        allowClear={false}
      />
      {roomProjectId ? (
        <button
          type="button"
          onClick={() => void choose(null)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3" />
          Clear room project
        </button>
      ) : null}
    </div>
  );
}

const EMPTY: string[] = [];
