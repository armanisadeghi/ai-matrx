"use client";

// features/war-room/components/all/OrphanThreadRow.tsx
//
// One unassigned thread on `/war-room/all` — browse-only row with attach or
// open-in-new-room actions (no inline editor).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2, MessageSquare, PlusSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSessionsList,
  selectThreadById,
} from "@/features/war-room/redux/selectors";
import {
  attachOrphanThreadToRoom,
  openOrphanThreadInNewRoom,
} from "@/features/war-room/redux/thunks";
import { dynamicTabKind } from "@/features/war-room/components/room/threadKind";
import type { ThreadAnchorType } from "@/features/war-room/types";

export function OrphanThreadRow({ threadId }: { threadId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const thread = useAppSelector(selectThreadById(threadId));
  const sessions = useAppSelector(selectSessionsList);
  const [attaching, setAttaching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!thread) return null;

  const anchorType = (thread.anchor_type as ThreadAnchorType) ?? "canvas";
  const kind = dynamicTabKind("task", anchorType);
  const KindIcon = kind.Icon;
  const busy = attaching || opening || pending;
  const title = thread.title?.trim() || "Untitled thread";

  async function handleAttach(roomId: string) {
    if (busy) return;
    setAttaching(true);
    await dispatch(attachOrphanThreadToRoom(threadId, roomId));
    setAttaching(false);
  }

  async function handleOpenInNewRoom() {
    if (busy) return;
    setOpening(true);
    const roomId = await dispatch(openOrphanThreadInNewRoom(threadId));
    setOpening(false);
    if (roomId) {
      startTransition(() =>
        router.push(`/war-room/${roomId}?thread=${threadId}`),
      );
    }
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3",
        busy && "opacity-70 pointer-events-none",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            kind.bg,
            kind.text,
          )}
        >
          <MessageSquare className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <KindIcon className="size-3 shrink-0" />
            <span>{kind.label}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>No room</span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {sessions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                className="gap-1.5"
              >
                {attaching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderInput className="size-3.5" />
                )}
                Attach to room
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-64 w-52 overflow-y-auto"
            >
              {sessions.map((room) => (
                <DropdownMenuItem
                  key={room.id}
                  onClick={() => void handleAttach(room.id)}
                  className="truncate"
                >
                  {room.title?.trim() || "Untitled room"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void handleOpenInNewRoom()}
          className="gap-1.5"
        >
          {opening || pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PlusSquare className="size-3.5" />
          )}
          Open in new room
        </Button>
      </div>
    </li>
  );
}
