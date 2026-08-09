"use client";

// features/war-room/components/room/RoomProjectButton.tsx
//
// Room-level PROJECT association panel. Independent of each thread's own
// project anchor — no conflict prompts; the user sets both however they want.
//
// Re-housed 2026-08-09 (core-route-headers conformance): the header trigger
// button died with the in-body header — the picker body is now launched from
// RoomHeader's "⋯" overflow menu (which also carries the current project name
// in its item label) inside a CONTROLLED popover, so only the body is exported.

import { X } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setRoomProjectThunk } from "@/features/war-room/redux/thunks";
import { ProjectPicker } from "@/features/projects/components/ProjectPicker";

export function RoomProjectPickerBody({
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
      <ProjectPicker
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
