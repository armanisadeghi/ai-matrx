"use client";

// features/war-room/components/room/WarRoomGallery.tsx
//
// Grid mode: the bird's-eye gallery of every thread, all at once. Orders tiles
// (pinned first), appends the always-present "new" tile, and lays everything out
// with the generic gallery-layout engine so the grid fills the viewport —
// beautiful at three, dense at twelve, scrolling beyond. The Comfortable/Compact
// density dial (from useRoomView) retunes the engine's minTile floor; a
// double-click or the tile "focus" button promotes any card to the Stage. Parked
// (hidden) threads dock in the bottom tray.

import { useAppSelector } from "@/lib/redux/hooks";
import { useGalleryLayout } from "@/hooks/useGalleryLayout";
import { cn } from "@/lib/utils";
import {
  selectHiddenTiles,
  selectOrderedGalleryTileIds,
  selectTileIdsForSession,
} from "@/features/war-room/redux/selectors";
import type { GalleryPlacement } from "@/lib/layout/galleryLayout";
import { WarRoomTile } from "../tile/WarRoomTile";
import { NewTile } from "../tile/NewTile";
import { HiddenTilesTray } from "./HiddenTilesTray";
import { useRoomView, DENSITY_LAYOUT } from "./roomViewContext";

function cellStyle(p: GalleryPlacement | undefined): React.CSSProperties {
  if (!p) return {};
  return {
    gridColumn: `${p.colStart} / span ${p.colSpan}`,
    gridRow: `${p.rowStart} / span ${p.rowSpan}`,
  };
}

export function WarRoomGallery({ sessionId }: { sessionId: string }) {
  const visibleIds = useAppSelector(selectOrderedGalleryTileIds(sessionId));
  const hidden = useAppSelector(selectHiddenTiles(sessionId));
  const allIds = useAppSelector(selectTileIdsForSession(sessionId));
  const { density, stageTile } = useRoomView();
  const floors = DENSITY_LAYOUT[density];

  // +1 for the always-present "new" tile.
  const count = visibleIds.length + 1;
  const { ref, layout } = useGalleryLayout(count, floors);

  const newTilePlacement = layout.placements[visibleIds.length];

  return (
    <div className="h-full flex flex-col min-h-0">
      <div
        ref={ref}
        className={cn(
          "flex-1 min-h-0 grid",
          density === "compact" ? "p-2" : "p-3",
          layout.scroll ? "overflow-y-auto scrollbar-thin" : "overflow-hidden",
        )}
        style={{
          gridTemplateColumns: layout.colTemplate,
          gridTemplateRows: layout.rowTemplate,
          gap: floors.gap,
        }}
      >
        {visibleIds.map((id, i) => {
          const p = layout.placements[i];
          return (
            <div
              key={id}
              style={cellStyle(p)}
              className="min-h-0 transition-[grid-column,grid-row] duration-200"
            >
              <WarRoomTile
                tileId={id}
                sessionId={sessionId}
                featured={p?.featured}
                onStage={() => stageTile(id)}
              />
            </div>
          );
        })}

        <div key="__new_tile__" style={cellStyle(newTilePlacement)} className="min-h-0">
          <NewTile
            sessionId={sessionId}
            nextPosition={allIds.length}
            onCreated={(tileId) => stageTile(tileId)}
          />
        </div>
      </div>

      <HiddenTilesTray sessionId={sessionId} tiles={hidden} />
    </div>
  );
}
