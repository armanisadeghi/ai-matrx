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
  selectHiddenThreads,
  selectOrderedGalleryThreadIds,
  selectThreadIdsForRoom,
} from "@/features/war-room/redux/selectors";
import type { GalleryPlacement } from "@/lib/layout/galleryLayout";
import { WarRoomThread } from "../thread/WarRoomThread";
import { NewThread } from "../thread/NewThread";
import { HiddenThreadsTray } from "./HiddenThreadsTray";
import { useRoomView, DENSITY_LAYOUT } from "./roomViewContext";
import { ThreadSortable, SortableThread } from "./threadDrag";
import { useThreadReorder } from "@/features/war-room/hooks/useThreadReorder";
import { useThreadSearch } from "@/features/war-room/hooks/useThreadSearch";

function cellStyle(p: GalleryPlacement | undefined): React.CSSProperties {
  if (!p) return {};
  return {
    gridColumn: `${p.colStart} / span ${p.colSpan}`,
    gridRow: `${p.rowStart} / span ${p.rowSpan}`,
  };
}

export function WarRoomGallery({ sessionId }: { sessionId: string }) {
  const visibleIds = useAppSelector(selectOrderedGalleryThreadIds(sessionId));
  const hidden = useAppSelector(selectHiddenThreads(sessionId));
  const allIds = useAppSelector(selectThreadIdsForRoom(sessionId));
  const { density, stageThread, threadQuery } = useRoomView();
  const { commitOrder } = useThreadReorder(sessionId);
  const floors = DENSITY_LAYOUT[density];

  // While searching, the grid shows only matches (ranked), reordering is off,
  // and the "+new" cell is hidden (it's not a thread to filter against).
  const matchedIds = useThreadSearch(sessionId, visibleIds, threadQuery);
  const searching = threadQuery.trim().length > 0;
  const gridIds = searching ? matchedIds : visibleIds;

  // +1 for the always-present "new" tile (only when not searching).
  const count = gridIds.length + (searching ? 0 : 1);
  const { ref, layout } = useGalleryLayout(count, floors);

  const newThreadPlacement = layout.placements[gridIds.length];

  // Searching with zero matches → a clean message instead of an empty grid.
  if (searching && gridIds.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 grid place-items-center px-4">
          <p className="text-sm text-muted-foreground">
            No threads match “{threadQuery.trim()}”.
          </p>
        </div>
        <HiddenThreadsTray sessionId={sessionId} threads={hidden} />
      </div>
    );
  }

  const threadCells = gridIds.map((id, i) => {
    const p = layout.placements[i];
    return searching ? (
      // Filtered: flat cells (no reorder grip — reordering a subset is ambiguous).
      <div
        key={id}
        style={cellStyle(p)}
        className="min-h-0 transition-[grid-column,grid-row] duration-200"
      >
        <WarRoomThread
          threadId={id}
          sessionId={sessionId}
          featured={p?.featured}
          onStage={() => stageThread(id)}
        />
      </div>
    ) : (
      <SortableThread
        key={id}
        id={id}
        style={cellStyle(p)}
        className="min-h-0 transition-[grid-column,grid-row] duration-200"
      >
        {(dragHandle) => (
          <WarRoomThread
            threadId={id}
            sessionId={sessionId}
            featured={p?.featured}
            onStage={() => stageThread(id)}
            dragHandle={dragHandle}
          />
        )}
      </SortableThread>
    );
  });

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
        {searching ? (
          threadCells
        ) : (
          <ThreadSortable
            ids={visibleIds}
            strategy="grid"
            onReorder={commitOrder}
          >
            {threadCells}
          </ThreadSortable>
        )}

        {!searching ? (
          <div
            key="__new_thread__"
            style={cellStyle(newThreadPlacement)}
            className="min-h-0"
          >
            <NewThread
              sessionId={sessionId}
              nextPosition={allIds.length}
              onCreated={(threadId) => stageThread(threadId)}
            />
          </div>
        ) : null}
      </div>

      <HiddenThreadsTray sessionId={sessionId} threads={hidden} />
    </div>
  );
}
