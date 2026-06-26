"use client";

// features/war-room/components/tile/TileOptionsMenu.tsx
//
// The tile "…" options menu, shared by the Grid tile, the Stage tile, and the
// rail row. Pin/Unpin · (Bring to stage) · Expand · Hide · Remove, driven by the
// real TileActions. "Bring to stage" is the verb the Stage⇄Grid model adds —
// promote any tile to the focus pane; it only renders when an onStage handler
// is supplied and the tile isn't already staged.

import {
  MoreHorizontal,
  Pin,
  PinOff,
  Maximize2,
  Focus,
  EyeOff,
  Trash2,
  Building2,
  FolderInput,
  FolderMinus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { TileActions } from "@/features/war-room/hooks/useTileActions";
import {
  selectSessionsList,
  selectTileById,
  selectUnassignedSessionId,
} from "@/features/war-room/redux/selectors";
import {
  moveThreadToRoom,
  removeThreadFromRoom,
} from "@/features/war-room/redux/thunks";
import { useTileCopyForAiTarget } from "../shared/TileCopyForAiButton";
import { ProjectCopyForAiButton } from "@/features/projects/components/ProjectCopyForAiButton";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";

export function TileOptionsMenu({
  actions,
  tileId,
  onStage,
  isStaged,
  size = "sm",
  onOpenContext,
  contextActive,
}: {
  actions: TileActions;
  tileId?: string;
  onStage?: () => void;
  isStaged?: boolean;
  size?: "sm" | "md";
  /** When supplied, adds a "Context" item that opens the tile context picker (Grid mode moves the control here to free header space). */
  onOpenContext?: () => void;
  /** Highlights the Context item + labels it "overridden" when this tile overrides the session context. */
  contextActive?: boolean;
}) {
  const copyTarget = useTileCopyForAiTarget(tileId ?? "");
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectSessionsList);
  const tile = useAppSelector(selectTileById(tileId ?? null));
  const unassignedId = useAppSelector(selectUnassignedSessionId);
  const currentSessionId = tile?.session_id ?? null;
  const inHolding = !!currentSessionId && currentSessionId === unassignedId;
  // Rooms this thread can be moved INTO: every saved room but its own and the
  // "Unassigned" holding room (that's reached via "Remove from room", not here).
  const otherRooms = sessions.filter(
    (s) => s.id !== currentSessionId && s.id !== unassignedId,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Thread options"
          className={cn(
            "grid place-items-center shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            size === "md" ? "size-7" : "size-6",
          )}
        >
          <MoreHorizontal className={size === "md" ? "size-4" : "size-3.5"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onStage && !isStaged ? (
          <DropdownMenuItem onClick={onStage} className="gap-2">
            <Focus className="size-3.5 shrink-0" />
            Bring to stage
          </DropdownMenuItem>
        ) : null}
        {onOpenContext ? (
          <DropdownMenuItem onClick={onOpenContext} className="gap-2">
            <Building2
              className={cn(
                "size-3.5 shrink-0",
                contextActive && "text-primary",
              )}
            />
            {contextActive ? "Context (overridden)" : "Context"}
          </DropdownMenuItem>
        ) : null}
        {tileId && copyTarget ? (
          <DropdownMenuItem
            className="gap-2 p-0 focus:bg-transparent"
            onSelect={(e) => e.preventDefault()}
            asChild
          >
            {copyTarget.kind === "project" ? (
              <ProjectCopyForAiButton
                projectId={copyTarget.id}
                projectName={copyTarget.name}
                location="War Room — tile menu"
                size="sm"
                className="h-8 w-full justify-start rounded-none px-2 font-normal hover:bg-accent"
              />
            ) : (
              <TaskCopyForAiButton
                taskId={copyTarget.id}
                taskTitle={copyTarget.name}
                location="War Room — tile menu"
                size="sm"
                className="h-8 w-full justify-start rounded-none px-2 font-normal hover:bg-accent"
              />
            )}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={actions.togglePin} className="gap-2">
          {actions.isPinned ? (
            <PinOff className="size-3.5 shrink-0" />
          ) : (
            <Pin className="size-3.5 shrink-0" />
          )}
          {actions.isPinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        {actions.canExpand ? (
          <DropdownMenuItem onClick={actions.expand} className="gap-2">
            <Maximize2 className="size-3.5 shrink-0" />
            Expand
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={actions.hide} className="gap-2">
          <EyeOff className="size-3.5 shrink-0" />
          Hide
        </DropdownMenuItem>
        {tileId && otherRooms.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <FolderInput className="size-3.5 shrink-0" />
              Move to room
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 w-52 overflow-y-auto">
              {otherRooms.map((room) => (
                <DropdownMenuItem
                  key={room.id}
                  onClick={() => void dispatch(moveThreadToRoom(tileId, room.id))}
                  className="gap-2"
                >
                  <span className="truncate">
                    {room.title?.trim() || "Untitled room"}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {tileId && currentSessionId && !inHolding ? (
          <DropdownMenuItem
            onClick={() => void dispatch(removeThreadFromRoom(tileId))}
            className="gap-2"
          >
            <FolderMinus className="size-3.5 shrink-0" />
            Remove from room
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void actions.remove()}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="size-3.5 shrink-0" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
