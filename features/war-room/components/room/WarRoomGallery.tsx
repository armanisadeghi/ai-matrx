"use client";

// features/war-room/components/room/WarRoomGallery.tsx
//
// Grid mode: the bird's-eye gallery of every thread, all at once. Orders tiles
// (pinned first) and lays them out with the generic gallery-layout engine so the
// grid fills the viewport — beautiful at three, and past the point where cards
// would shrink below a usable size it SCROLLS at that floor instead of cramming.
// The Spacious/Comfortable/Compact density dial (from useRoomView) swaps the
// minTile floor; a double-click or the tile "focus" button promotes any card to
// the Stage. The "+new" affordance is NOT a grid cell — it lives in the room
// header (it used to distort the layout at low counts and steal a prime cell);
// an empty room shows the composer inline. Parked threads dock in the bottom tray.

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
import { QuickAddThread } from "../thread/QuickAddThread";
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

  // The grid lays out ONLY real threads now — the "+new" affordance moved to the
  // room header (it used to spend a full area-maximized cell here, distorting the
  // layout at low counts and shrinking the real threads).
  const { ref, layout } = useGalleryLayout(gridIds.length, floors);

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

  // No visible threads (not searching) → an inviting empty state with the
  // composer right there, instead of a blank grid.
  if (gridIds.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 grid place-items-center px-4">
          <div className="w-full max-w-sm">
            <p className="mb-1 text-center text-sm font-medium text-foreground">
              {hidden.length > 0 ? "No active threads" : "No threads yet"}
            </p>
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Spin up a thread — a task, a project, or a freeform canvas.
            </p>
            <QuickAddThread
              sessionId={sessionId}
              nextPosition={allIds.length}
              onOpen={(id) => stageThread(id)}
            />
          </div>
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
      </div>

      <HiddenThreadsTray sessionId={sessionId} threads={hidden} />
    </div>
  );
}
