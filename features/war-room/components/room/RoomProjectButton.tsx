"use client";

// features/war-room/components/room/RoomProjectButton.tsx
//
// Room-level PROJECT association in the header. Independent of each thread's
// own project anchor — no conflict prompts; the user sets both however they want.

import { FolderKanban, ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSessionProjectId,
  selectSessionProjectMode,
} from "@/features/war-room/redux/selectors";
import { setRoomProjectThunk } from "@/features/war-room/redux/thunks";
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
          title="Associate this War Room with a project (optional default context)"
        >
          <FolderKanban className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <RoomProjectPickerBody
          sessionId={sessionId}
          roomProjectId={roomProjectId}
          mode={mode}
        />
      </PopoverContent>
    </Popover>
  );
}

function RoomProjectPickerBody({
  sessionId,
  roomProjectId,
  mode,
}: {
  sessionId: string;
  roomProjectId: string | null;
  mode: "room" | "per-thread" | "none";
}) {
  const dispatch = useAppDispatch();

  async function choose(id: string | null) {
    if (!id) {
      if (roomProjectId) await dispatch(setRoomProjectThunk(sessionId, null));
      return;
    }
    if (id === roomProjectId) return;
    await dispatch(setRoomProjectThunk(sessionId, id));
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-xs font-semibold text-foreground">Room project</p>
        <p className="text-[11px] text-muted-foreground">
          {mode === "per-thread"
            ? "Threads may use their own projects. This sets an optional room-level project."
            : "Optional project context for this room. Threads can still use different projects."}
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
