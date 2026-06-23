"use client";

// features/war-room/components/room/StageView.tsx
//
// The hero layout: a live RAIL of every thread (a glanceable watchlist) beside
// the STAGE (the one thread you're driving). Click any rail thread → it snaps
// onto the Stage with full state — every open thread alive in one space, resume
// any instantly without losing context.
//
// Parked (hidden) threads fold into a quiet collapsible group at the bottom of
// the rail, each rendered with the ui-sharp parked-chip treatment (live status
// trio, restore-and-stage on click) so a parked thread still reads as alive.

import { useEffect, useState } from "react";
import { ChevronRight, EyeOff } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  selectHiddenTiles,
  selectOrderedGalleryTileIds,
  selectTileIdsForSession,
} from "@/features/war-room/redux/selectors";
import { RailTile } from "./RailTile";
import { StageTile } from "./StageTile";
import { ParkedThreadChip } from "./ParkedThreadChip";
import { NewTile } from "../tile/NewTile";
import { QuickAddThread } from "../tile/QuickAddThread";
import { QuickAddTask } from "../tile/QuickAddTask";
import { useRoomView, resolveStagedId } from "./roomViewContext";
import { ThreadSortable, SortableThread } from "./threadDrag";
import { useThreadReorder } from "@/features/war-room/hooks/useThreadReorder";
import { useThreadSearch } from "@/features/war-room/hooks/useThreadSearch";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

export function StageView({ sessionId }: { sessionId: string }) {
  const visibleIds = useAppSelector(selectOrderedGalleryTileIds(sessionId));
  const hidden = useAppSelector(selectHiddenTiles(sessionId));
  const allIds = useAppSelector(selectTileIdsForSession(sessionId));
  const { chosenStageId, setChosenStageId, stageTile, threadQuery } =
    useRoomView();
  const { commitOrder } = useThreadReorder(sessionId);
  // The rail lists only matches; the Stage keeps the thread you're driving
  // (resolved against the FULL list) so a search never yanks you off it.
  const railIds = useThreadSearch(sessionId, visibleIds, threadQuery);
  const searching = threadQuery.trim().length > 0;
  const [parkedOpen, setParkedOpen] = useState(false);

  const stagedId = resolveStagedId(chosenStageId, visibleIds);

  useEffect(() => {
    traceWarRoomRenderPath(3, "StageView.tsx", "Stage view render", {
      sessionId,
      stagedTileId: stagedId,
      visibleThreadCount: visibleIds.length,
    });
  }, [sessionId, stagedId, visibleIds.length]);

  return (
    <div className="h-full flex flex-col @4xl:flex-row gap-2.5 p-2.5 min-h-0">
      {/* ── Rail (watchlist of live threads) ── */}
      <aside className="shrink-0 flex flex-col min-h-0 @4xl:w-[300px] @5xl:w-[340px]">
        <div className="shrink-0 flex items-center justify-between px-1 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Threads
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {searching ? `${railIds.length}/${visibleIds.length}` : visibleIds.length}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-1.5 pr-0.5">
          {searching ? (
            // Filtered: a flat, non-sortable list (reordering a subset is
            // ambiguous) ranked by relevance.
            railIds.length > 0 ? (
              railIds.map((id) => (
                <RailTile
                  key={id}
                  tileId={id}
                  sessionId={sessionId}
                  isStaged={stagedId === id}
                  onStage={() => setChosenStageId(id)}
                />
              ))
            ) : (
              <p className="px-1 py-2 text-[12px] text-muted-foreground">
                No threads match “{threadQuery.trim()}”.
              </p>
            )
          ) : (
            <ThreadSortable
              ids={visibleIds}
              strategy="vertical"
              onReorder={commitOrder}
            >
              {visibleIds.map((id) => (
                <SortableThread key={id} id={id}>
                  {(dragHandle) => (
                    <RailTile
                      tileId={id}
                      sessionId={sessionId}
                      isStaged={stagedId === id}
                      onStage={() => setChosenStageId(id)}
                      dragHandle={dragHandle}
                    />
                  )}
                </SortableThread>
              ))}
            </ThreadSortable>
          )}

          {/* Quick-add: spin up a new thread without leaving the staged one.
              Create (default) keeps you here on the staged thread and re-arms
              for the next add; Create & open stages the fresh thread. Hidden
              while searching (it's not a thread to filter). */}
          {!searching ? (
            <>
              <QuickAddThread
                sessionId={sessionId}
                nextPosition={allIds.length}
                variant="rail"
                onOpen={(tileId) => stageTile(tileId)}
              />
              {/* Capture a task into the room (or into the staged thread)
                  without leaving the thread you're on (Feature 67a282c8). */}
              <QuickAddTask
                sessionId={sessionId}
                nextPosition={allIds.length}
                stagedTileId={stagedId}
                onOpen={(tileId) => stageTile(tileId)}
              />
            </>
          ) : null}

          {hidden.length > 0 ? (
            <div className="mt-1 pt-1.5 border-t border-border/50">
              <button
                type="button"
                onClick={() => setParkedOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 px-1 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    parkedOpen && "rotate-90",
                  )}
                />
                <EyeOff className="size-3.5" />
                Parked ({hidden.length})
              </button>
              {parkedOpen ? (
                <div className="mt-1 flex flex-col gap-1.5">
                  {hidden.map((t) => (
                    <ParkedThreadChip
                      key={t.id}
                      tileId={t.id}
                      title={t.title?.trim() || "Untitled thread"}
                      onRestore={(id) => stageTile(id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      {/* ── Stage (the focused thread) ── */}
      <main className="flex-1 min-h-0 @max-4xl:min-h-[60vh]">
        {stagedId ? (
          <StageTile key={stagedId} tileId={stagedId} sessionId={sessionId} />
        ) : (
          <EmptyStage
            sessionId={sessionId}
            nextPosition={allIds.length}
            onCreated={(id) => stageTile(id)}
          />
        )}
      </main>
    </div>
  );
}

function EmptyStage({
  sessionId,
  nextPosition,
  onCreated,
}: {
  sessionId: string;
  nextPosition: number;
  onCreated: (tileId: string) => void;
}) {
  return (
    <div className="h-full grid place-items-center rounded-2xl border border-dashed border-border bg-card/30">
      <div className="text-center max-w-xs px-6">
        <p className="text-sm font-semibold text-foreground">
          No thread staged
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Start your first thread — it will open right here, ready to work.
        </p>
        <div className="mt-3 inline-flex">
          <NewTile
            sessionId={sessionId}
            nextPosition={nextPosition}
            variant="rail"
            onCreated={onCreated}
          />
        </div>
      </div>
    </div>
  );
}
