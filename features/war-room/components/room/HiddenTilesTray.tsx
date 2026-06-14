"use client";

// features/war-room/components/room/HiddenTilesTray.tsx
//
// Google-Meet-style tray for hidden tiles: a slim strip of chips you can click
// to bring a tile back into the gallery.

import { Eye, EyeOff } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toggleTileHide } from "@/features/war-room/redux/thunks";
import type { WarRoomTile } from "@/features/war-room/types";

export function HiddenTilesTray({
  tiles,
}: {
  sessionId: string;
  tiles: WarRoomTile[];
}) {
  const dispatch = useAppDispatch();
  if (tiles.length === 0) return null;

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/30 overflow-x-auto">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground shrink-0">
        <EyeOff className="size-3.5" />
        Hidden ({tiles.length})
      </span>
      <div className="flex items-center gap-1.5">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dispatch(toggleTileHide(t.id, false))}
            className="group flex items-center gap-1 rounded-md border border-border bg-card px-2 h-6 text-[11px] text-foreground hover:border-primary/40 hover:text-primary transition-colors shrink-0"
            title="Show tile"
          >
            <span className="max-w-32 truncate">
              {t.title?.trim() || "Untitled tile"}
            </span>
            <Eye className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}
