"use client";

// features/war-room/components/room/ImportThreadDialog.tsx
//
// "Bring an existing thread into THIS room" — association-only import opened
// from the Stage rail's Import thread action. Lists every one of the user's
// threads that is NOT already in this room, grouped Unassigned / by current
// room, searchable.
// Picking one offers the two membership verbs:
//   Move here — re-point its `thread → war_room` membership edge(s)
//   Add here  — write a second membership edge (lives in both rooms)
// Unassigned threads get a single "Add to this room". Nothing but edges —
// no clones, no copies (`attachExistingThreadToRoom`).

import { useEffect, useState } from "react";
import {
  ArrowRight,
  FolderInput,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectSessionsList } from "@/features/war-room/redux/selectors";
import {
  attachExistingThreadToRoom,
  loadSessionsList,
} from "@/features/war-room/redux/thunks";
import * as service from "@/features/war-room/service";
import { listThreadRoomMemberships } from "@/features/war-room/service/associations";
import type { WarRoomThread } from "@/features/war-room/types";
import { cn } from "@/lib/utils";

interface ImportRow {
  thread: WarRoomThread;
  /** Rooms the thread currently lives in (empty = unassigned). */
  roomIds: string[];
}

export function ImportThreadDialog({
  open,
  onOpenChange,
  roomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
}) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectSessionsList);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [picked, setPicked] = useState<ImportRow | null>(null);
  const [busy, setBusy] = useState<"move" | "add" | null>(null);

  // Reset on close via the open-change path (not an effect — lint-clean).
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setRows(null);
      setPicked(null);
      setBusy(null);
    }
    onOpenChange(o);
  };

  // Load candidates on open: every user thread not already in this room.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (sessions.length === 0) void dispatch(loadSessionsList());
    void (async () => {
      try {
        const threads = await service.listAllUserThreads();
        const memberships = await listThreadRoomMemberships(
          threads.map((t) => t.id),
        );
        if (cancelled) return;
        setRows(
          threads
            .map((thread) => ({
              thread,
              roomIds: memberships.get(thread.id) ?? [],
            }))
            .filter((r) => !r.roomIds.includes(roomId)),
        );
      } catch (err) {
        console.error("[ImportThreadDialog] failed to list threads", err);
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, roomId, sessions.length, dispatch]);

  const roomTitle = (id: string) =>
    sessions.find((s) => s.id === id)?.title?.trim() || "Untitled room";

  const run = async (mode: "move" | "add") => {
    if (!picked || busy) return;
    setBusy(mode);
    const ok = await dispatch(
      attachExistingThreadToRoom(picked.thread.id, roomId, mode),
    );
    setBusy(null);
    if (ok) handleOpenChange(false);
  };

  const unassigned = (rows ?? []).filter((r) => r.roomIds.length === 0);
  const inOtherRooms = (rows ?? []).filter((r) => r.roomIds.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Search your threads…" />
      <CommandList>
        {rows === null ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CommandEmpty>No other threads found.</CommandEmpty>
            {unassigned.length > 0 ? (
              <CommandGroup heading="Unassigned">
                {unassigned.map((row) => (
                  <ImportThreadItem
                    key={row.thread.id}
                    row={row}
                    active={picked?.thread.id === row.thread.id}
                    onPick={() => setPicked(row)}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {inOtherRooms.length > 0 ? (
              <CommandGroup heading="In other rooms">
                {inOtherRooms.map((row) => (
                  <ImportThreadItem
                    key={row.thread.id}
                    row={row}
                    subtitle={row.roomIds.map(roomTitle).join(" · ")}
                    active={picked?.thread.id === row.thread.id}
                    onPick={() => setPicked(row)}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </>
        )}
      </CommandList>

      {/* Verb step — Move vs Add for room-homed threads; Add for orphans.
          Cancel is always available so the dialog matches Add thread / Add
          quick task (explicit dismiss, not only Escape / click-outside). */}
      <div className="flex items-center gap-2 border-t border-border p-2">
        {picked ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <b className="text-foreground">
              {picked.thread.title?.trim() || "Untitled thread"}
            </b>
            {picked.roomIds.length > 0
              ? ` — in ${picked.roomIds.map(roomTitle).join(", ")}`
              : " — unassigned"}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            Pick a thread to import into this room
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={!!busy}
          onClick={() => handleOpenChange(false)}
          className="h-7 px-2 text-xs"
        >
          Cancel
        </Button>
        {picked && picked.roomIds.length > 0 ? (
          <>
            <Button
              size="sm"
              variant="default"
              disabled={!!busy}
              onClick={() => void run("move")}
              className="h-7 gap-1 px-2 text-xs"
            >
              {busy === "move" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowRight className="size-3.5" />
              )}
              Move here
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => void run("add")}
              className="h-7 gap-1 px-2 text-xs"
              title="Keep it in its current room too"
            >
              {busy === "add" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add here
            </Button>
          </>
        ) : null}
        {picked && picked.roomIds.length === 0 ? (
          <Button
            size="sm"
            variant="default"
            disabled={!!busy}
            onClick={() => void run("add")}
            className="h-7 gap-1 px-2 text-xs"
          >
            {busy === "add" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FolderInput className="size-3.5" />
            )}
            Add to this room
          </Button>
        ) : null}
      </div>
    </CommandDialog>
  );
}

function ImportThreadItem({
  row,
  subtitle,
  active,
  onPick,
}: {
  row: ImportRow;
  subtitle?: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <CommandItem
      value={`${row.thread.title ?? ""} ${row.thread.id}`}
      onSelect={onPick}
      className={cn("gap-2", active && "bg-accent")}
    >
      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {row.thread.title?.trim() || "Untitled thread"}
      </span>
      {subtitle ? (
        <span className="max-w-[10rem] shrink-0 truncate text-[10px] text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
    </CommandItem>
  );
}
