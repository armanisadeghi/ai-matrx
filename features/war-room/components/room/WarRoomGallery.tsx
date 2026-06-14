"use client";

// features/war-room/components/room/WarRoomGallery.tsx
//
// The dynamic tile gallery. Orders tiles (pinned first), appends the
// always-present "new" tile, and lays everything out with the generic
// gallery-layout engine so the grid fills the viewport — beautiful at three,
// dense at twelve, scrolling beyond.

import { useAppSelector } from "@/lib/redux/hooks";
import { useGalleryLayout } from "@/hooks/useGalleryLayout";
import { cn } from "@/lib/utils";
import {
  GALLERY_GAP_PX,
  GALLERY_MIN_TILE,
  GALLERY_TARGET_ASPECT,
} from "@/features/war-room/constants";
import {
  selectHiddenTiles,
  selectOrderedGalleryTileIds,
  selectTileIdsForSession,
} from "@/features/war-room/redux/selectors";
import type { GalleryPlacement } from "@/lib/layout/galleryLayout";
import { WarRoomTile } from "../tile/WarRoomTile";
import { NewTile } from "../tile/NewTile";
import { HiddenTilesTray } from "./HiddenTilesTray";

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

  // +1 for the always-present "new" tile.
  const count = visibleIds.length + 1;
  const { ref, layout } = useGalleryLayout(count, {
    gap: GALLERY_GAP_PX,
    minTile: GALLERY_MIN_TILE,
    targetAspect: GALLERY_TARGET_ASPECT,
  });

  const newTilePlacement = layout.placements[visibleIds.length];

  return (
    <div className="h-full flex flex-col min-h-0">
      <div
        ref={ref}
        className={cn(
          "flex-1 min-h-0 grid p-3",
          layout.scroll ? "overflow-y-auto" : "overflow-hidden",
        )}
        style={{
          gridTemplateColumns: layout.colTemplate,
          gridTemplateRows: layout.rowTemplate,
          gap: GALLERY_GAP_PX,
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
              />
            </div>
          );
        })}

        <div key="__new_tile__" style={cellStyle(newTilePlacement)} className="min-h-0">
          <NewTile sessionId={sessionId} nextPosition={allIds.length} />
        </div>
      </div>

      <HiddenTilesTray sessionId={sessionId} tiles={hidden} />
    </div>
  );
}
