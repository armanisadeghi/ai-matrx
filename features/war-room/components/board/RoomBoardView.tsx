"use client";

// features/war-room/components/board/RoomBoardView.tsx
//
// Board mode: every visible thread is a tile on the spatial board — pan/zoom,
// focus (Enter), throws, the ONE right-click menu, minimap, zoom-paced detail.
// A CONSUMER of `features/spatial` (the engine is never forked here): the tile
// body is the whole `WarRoomThread` card, exactly as Grid renders it.
//
// One path per action, reused from the room:
//   • park (throw right / menu)  → the room's existing park = `toggleThreadHide`
//     (per-user hide). The board's shelf IS the room's parked list.
//   • delete (throw down / menu) → a consequence-naming confirm, then the
//     room's `deleteThread`, committed only after the Undo window closes.
//   • up                         → nothing (a thread has no "save & close").
// Where each tile sits and the camera are remembered on the room row
// (`metadata.spatial_layout`, debounced) — see `boardLayout.ts`.

import { useEffect, useRef, useState } from "react";
import { PanelsTopLeft } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { recordToast } from "@/lib/toast";
import { screenToWorld, type Rect } from "@/features/spatial/engine/camera";
import type { SpatialStore } from "@/features/spatial/engine/spatial-store";
import type { ThrowAction, ThrowDirection } from "@/features/spatial/engine/throw";
import type { TileStatusValue } from "@/features/spatial/streams/useSourceStatus";
import { useBoard } from "@/features/spatial/board/useBoard";
import { useWheelModePreference } from "@/features/spatial/board/useWheelModePreference";
import { SpatialViewport } from "@/features/spatial/components/SpatialViewport";
import { SpatialTile } from "@/features/spatial/components/SpatialTile";
import { SpatialBoardMenu } from "@/features/spatial/components/SpatialBoardMenu";
import { ParkedShelf } from "@/features/spatial/components/ParkedShelf";
import { Minimap, ZoomHud } from "@/features/spatial/components/SpatialChrome";
import {
  selectHiddenThreads,
  selectOrderedGalleryThreadIds,
  selectSessionById,
  selectThreadById,
  selectThreadIdsForRoom,
} from "@/features/war-room/redux/selectors";
import {
  deleteThread,
  persistRoomMetadataKey,
  toggleThreadHide,
} from "@/features/war-room/redux/thunks";
import { useThreadPulse } from "@/features/war-room/hooks/useThreadPulse";
import { useThreadSearch } from "@/features/war-room/hooks/useThreadSearch";
import { WarRoomThread } from "../thread/WarRoomThread";
import { useRoomView } from "../room/roomViewContext";
import {
  BOARD_LAYOUT_KEY,
  BOARD_TILE_H,
  BOARD_TILE_W,
  type BoardLayout,
  initialBoardRects,
  parseBoardLayout,
  placeNewcomers,
  serializeBoardLayout,
} from "./boardLayout";

const SAVE_DEBOUNCE_MS = 800;
/** How long a delete can be undone before it is committed. */
const DELETE_UNDO_MS = 6000;

const THREAD_THROWS: Record<ThrowDirection, ThrowAction> = {
  right: "park",
  down: "delete",
  up: "none",
  left: "none",
};

interface ThreadTileSpec {
  id: string;
  rect: Rect;
}

function threadTitle(title: string | null | undefined): string {
  return title?.trim() || "Untitled thread";
}

export function RoomBoardView({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const appStore = useAppStore();
  const session = useAppSelector(selectSessionById(sessionId));
  const orderedIds = useAppSelector(selectOrderedGalleryThreadIds(sessionId));
  const roomThreadIds = useAppSelector(selectThreadIdsForRoom(sessionId));
  const hidden = useAppSelector(selectHiddenThreads(sessionId));
  const { threadQuery } = useRoomView();

  // Deletes waiting out their Undo window leave the board at once.
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(() => new Set());
  const visibleIds = orderedIds.filter((id) => !deleting.has(id));

  // ── the remembered arrangement ─────────────────────────────────────────
  const [saved] = useState(() => parseBoardLayout(session?.metadata));
  const layoutRef = useRef<BoardLayout>(saved);
  const [initial] = useState(() => initialBoardRects(visibleIds, saved));
  const board = useBoard<ThreadTileSpec>(() => initial);
  const [store, setStore] = useState<SpatialStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ roomThreadIds });
  useEffect(() => {
    latest.current = { roomThreadIds };
  });

  const flushSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    // The camera is recorded only by the frame subscription below — i.e. once
    // it has really moved — so a save that fires before the first fit never
    // stores the viewport's placeholder camera.
    const { roomThreadIds: ids } = latest.current;
    void dispatch(
      persistRoomMetadataKey(
        sessionId,
        BOARD_LAYOUT_KEY,
        serializeBoardLayout(layoutRef.current, ids),
      ),
    );
  };
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };
  const flushRef = useRef(flushSave);
  const scheduleRef = useRef(scheduleSave);
  useEffect(() => {
    flushRef.current = flushSave;
    scheduleRef.current = scheduleSave;
  });

  // First open of a board with threads nobody placed yet: remember the tidy
  // arrangement so it is stable on the next visit.
  useEffect(() => {
    let changed = false;
    for (const { id, rect } of initial) {
      if (!layoutRef.current.tiles[id]) {
        layoutRef.current.tiles[id] = rect;
        changed = true;
      }
    }
    if (changed) scheduleRef.current();
  }, [initial]);

  // A camera move is remembered too (only a real change schedules a write).
  useEffect(() => {
    if (!store) return;
    return store.subscribeFrame(() => {
      const c = store.getCamera();
      const prev = layoutRef.current.camera;
      if (
        prev &&
        Math.abs(prev.x - c.x) < 1 &&
        Math.abs(prev.y - c.y) < 1 &&
        Math.abs(prev.z - c.z) / c.z < 0.005
      )
        return;
      layoutRef.current.camera = c;
      scheduleRef.current();
    });
  }, [store]);

  // Leaving Board (or the room) never drops a pending save.
  useEffect(
    () => () => {
      if (saveTimer.current) flushRef.current();
    },
    [],
  );

  // ── keep the board in step with the room ───────────────────────────────
  // Parked or deleted threads leave (their rect is remembered); new or
  // restored threads arrive — at their remembered rect, or in the nearest
  // free space to where you are looking.
  const pendingFly = useRef<string | null>(null);
  const boardIds = board.tiles.map((t) => t.id).join("|");
  const visibleKey = visibleIds.join("|");
  useEffect(() => {
    const onBoard = new Set(board.tiles.map((t) => t.id));
    const visible = new Set(visibleIds);
    const gone = board.tiles.filter((t) => !visible.has(t.id)).map((t) => t.id);
    if (gone.length > 0) board.dropTiles(gone);
    const arriving = visibleIds.filter((id) => !onBoard.has(id));
    if (arriving.length === 0) return;
    const remembered = arriving.filter((id) => layoutRef.current.tiles[id]);
    const fresh = arriving.filter((id) => !layoutRef.current.tiles[id]);
    const occupied = board.tiles.filter((t) => visible.has(t.id)).map((t) => t.rect);
    for (const id of remembered) occupied.push(layoutRef.current.tiles[id]);
    const placedFresh = placeNewcomers(occupied, fresh, viewCentre(store, occupied));
    for (const p of placedFresh) layoutRef.current.tiles[p.id] = p.rect;
    board.addTiles([
      ...remembered.map((id) => ({ id, rect: layoutRef.current.tiles[id] })),
      ...placedFresh,
    ]);
    if (placedFresh.length > 0) scheduleRef.current();
    // `board` is a new object every render, so this runs after each render;
    // it is a pure diff, a no-op once the board matches the room.
  }, [visibleKey, boardIds, board, visibleIds, store]);

  // A thread restored from the shelf: fly to it once its tile is back.
  useEffect(() => {
    const id = pendingFly.current;
    if (!id || !store || !board.tiles.some((t) => t.id === id)) return;
    pendingFly.current = null;
    requestAnimationFrame(() => {
      store.select(id);
      store.fitItem(id);
    });
  }, [boardIds, store, board.tiles]);

  // The header search flies to the best match (the board never hides tiles).
  const matches = useThreadSearch(sessionId, visibleIds, threadQuery);
  const bestMatch = threadQuery.trim() ? (matches[0] ?? null) : null;
  useEffect(() => {
    if (!store || !bestMatch) return;
    store.select(bestMatch);
    store.fitItem(bestMatch);
  }, [store, bestMatch]);

  // ── actions: one path each ─────────────────────────────────────────────
  const titleOf = (id: string) =>
    threadTitle(appStore.getState().warRoom.threadsById[id]?.title);

  const moveTile = (id: string, x: number, y: number) => {
    board.moveTile(id, x, y);
    const cur = board.tiles.find((t) => t.id === id)?.rect ?? layoutRef.current.tiles[id];
    layoutRef.current.tiles[id] = {
      x,
      y,
      w: cur?.w ?? BOARD_TILE_W,
      h: cur?.h ?? BOARD_TILE_H,
    };
    scheduleSave();
  };

  const unpark = (id: string) => {
    pendingFly.current = id;
    void dispatch(toggleThreadHide(id, false));
  };

  const park = (id: string) => {
    const title = titleOf(id);
    void dispatch(toggleThreadHide(id, true));
    recordToast.message({ type: "thread", id, title }, `Parked "${title}"`, {
      action: { label: "Undo", onClick: () => unpark(id) },
    });
  };

  const remove = async (id: string) => {
    const title = titleOf(id);
    const ok = await confirm({
      title: `Delete "${title}" from this War Room?`,
      description:
        "The thread and its card leave this room. Its task, notes, recordings, files and chats stay safe in their own features. You can undo for a few seconds.",
      confirmLabel: "Delete thread",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting((prev) => new Set(prev).add(id));
    let undone = false;
    const commit = setTimeout(() => {
      if (!undone) void dispatch(deleteThread(id, sessionId));
    }, DELETE_UNDO_MS);
    recordToast.message({ type: "thread", id, title }, `Deleted "${title}"`, {
      duration: DELETE_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          clearTimeout(commit);
          pendingFly.current = id;
          setDeleting((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    });
  };

  const onThrow = (id: string, direction: ThrowDirection) => {
    const action = THREAD_THROWS[direction];
    if (action === "park") park(id);
    else if (action === "delete") void remove(id);
  };

  const parkedChips = hidden.map((t) => ({
    id: t.id,
    title: threadTitle(t.title),
    icon: PanelsTopLeft,
  }));

  return (
    <SpatialBoardMenu
      store={store}
      actions={{
        park,
        remove: (id) => void remove(id),
        removeLabel: "Delete thread…",
      }}
      parked={parkedChips}
      onUnpark={unpark}
      wheelMode={wheelMode}
      onWheelMode={setWheelMode}
    >
      <SpatialViewport
        insets={{ top: 16, bottom: 64 }}
        wheelMode={wheelMode}
        onStore={setStore}
        initialCamera={saved.camera ?? undefined}
        fitOnMount={!saved.camera}
        overlay={
          <>
            <ParkedShelf parked={parkedChips} onRestore={unpark} />
            <ZoomHud />
            <Minimap />
            {board.tiles.length === 0 && (
              <div
                data-spatial-chrome
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-md"
              >
                {hidden.length > 0
                  ? "Every thread is parked — restore one from the shelf."
                  : "No threads yet — add one from Stage or Grid."}
              </div>
            )}
          </>
        }
      >
        {board.tiles.map((t) => (
          <BoardThreadTile
            key={t.id}
            threadId={t.id}
            sessionId={sessionId}
            rect={t.rect}
            onMove={moveTile}
            onThrow={onThrow}
          />
        ))}
      </SpatialViewport>
    </SpatialBoardMenu>
  );
}

/** World point at the centre of what you are looking at. */
function viewCentre(store: SpatialStore | null, occupied: Rect[]): { x: number; y: number } {
  if (store) {
    const { w, h } = store.getSize();
    if (w > 0 && h > 0) return screenToWorld(store.getCamera(), w / 2, h / 2);
  }
  if (occupied.length === 0) return { x: BOARD_TILE_W / 2, y: BOARD_TILE_H / 2 };
  const last = occupied[occupied.length - 1];
  return { x: last.x + last.w * 1.5, y: last.y + last.h / 2 };
}

const IDLE: TileStatusValue = { status: "idle", progress: null };

function BoardThreadTile({
  threadId,
  sessionId,
  rect,
  onMove,
  onThrow,
}: {
  threadId: string;
  sessionId: string;
  rect: Rect;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
}) {
  const thread = useAppSelector(selectThreadById(threadId));
  const pulse = useThreadPulse(threadId);
  const status: TileStatusValue = pulse.isRecording
    ? { status: "streaming", progress: null }
    : pulse.hasTask && pulse.taskDone
      ? { status: "complete", progress: 1 }
      : pulse.subtaskTotal > 0
        ? { status: "queued", progress: pulse.subtaskDone / pulse.subtaskTotal }
        : IDLE;

  return (
    <SpatialTile
      id={threadId}
      rect={rect}
      title={threadTitle(thread?.title)}
      subtitle={pulse.headline}
      icon={PanelsTopLeft}
      statusFrom={{ kind: "static", value: status }}
      onMove={onMove}
      onThrow={onThrow}
      throwActions={THREAD_THROWS}
    >
      {() => <WarRoomThread threadId={threadId} sessionId={sessionId} />}
    </SpatialTile>
  );
}
