"use client";

// features/war-room/components/tile/WarRoomTile.tsx
//
// The tabbed tile shell: Task / Notes / Audio / All, with pin/hide controls.
// Wave 2 renders minimal placeholder bodies so layout, tabs, and pin/hide are
// testable; Wave 3 wires real task/notes/audio content into each tab.

import { ListChecks, NotebookPen, Mic, LayoutGrid } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { selectTileById } from "@/features/war-room/redux/selectors";
import {
  deleteTile,
  setTileActiveTabPersisted,
  toggleTileHide,
  toggleTilePin,
} from "@/features/war-room/redux/thunks";
import type { TileTab } from "@/features/war-room/types";
import { TileFrame } from "../shared/TileFrame";
import { TileTabBar } from "./TileTabBar";

export function WarRoomTile({
  tileId,
  sessionId,
  featured,
}: {
  tileId: string;
  sessionId: string;
  featured?: boolean;
}) {
  const dispatch = useAppDispatch();
  const tile = useAppSelector(selectTileById(tileId));
  if (!tile) return null;

  const activeTab = (tile.active_tab as TileTab) ?? "task";
  const title = tile.title?.trim() || "Untitled tile";

  async function handleDelete() {
    const ok = await confirm({
      title: "Remove this tile?",
      description:
        "The tile is removed from this War Room. Any linked task or note stays safe in its own feature.",
      variant: "destructive",
      confirmLabel: "Remove",
    });
    if (ok) dispatch(deleteTile(tileId, sessionId));
  }

  return (
    <TileFrame
      title={title}
      featured={featured}
      isPinned={tile.is_pinned}
      onTogglePin={() => dispatch(toggleTilePin(tileId, !tile.is_pinned))}
      onHide={() => dispatch(toggleTileHide(tileId, true))}
      onDelete={handleDelete}
      tabBar={
        <TileTabBar
          active={activeTab}
          onChange={(tab) => dispatch(setTileActiveTabPersisted(tileId, tab))}
        />
      }
    >
      <TileTabBody tab={activeTab} />
    </TileFrame>
  );
}

function TileTabBody({ tab }: { tab: TileTab }) {
  const config: Record<
    TileTab,
    { Icon: typeof ListChecks; label: string; hint: string }
  > = {
    task: { Icon: ListChecks, label: "Task", hint: "Name, subtasks, attachments, comments" },
    notes: { Icon: NotebookPen, label: "Notes", hint: "A free-form notepad for this thread" },
    audio: { Icon: Mic, label: "Audio", hint: "Record and transcribe into this tile" },
    combined: { Icon: LayoutGrid, label: "All", hint: "Task, notes, and audio together" },
  };
  const { Icon, label, hint } = config[tab];
  return (
    <div className="h-full grid place-items-center text-center px-3">
      <div className="text-muted-foreground">
        <Icon className="size-6 mx-auto mb-1.5 opacity-50" />
        <p className="text-xs font-medium text-foreground/80">{label}</p>
        <p className="text-[11px] mt-0.5 opacity-70">{hint}</p>
      </div>
    </div>
  );
}
