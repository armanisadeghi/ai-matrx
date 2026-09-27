"use client";

// features/war-room/components/board/RoomBoardView.tsx
//
// Board mode: every visible THREAD is a frame on the spatial board, and every
// PART of that thread — task, notes, audio, chat, resources, one per attached
// entity type (the tabs `useThreadTabs` derives, minus the stacked "All") — is
// its own tile inside the frame. Notes, files, audio and chat can all be out
// at once, side by side, nothing on top of anything. A CONSUMER of
// `features/spatial` (the engine is never forked here); each tile body is the
// thread's own tab renderer, `ThreadTabContent`, with that one tab.
//
// One path per action:
//   PART tile (throws, right-click)
//     • park (throw right)   → the part goes to the board's shelf (board-local)
//     • remove (throw down)  → the part leaves the board; its data is untouched,
//                              and the frame's Parts menu brings it back
//   FRAME header (the thread)
//     • drag                 → moves every part of the thread together
//     • pin · open in Stage · park thread (the room's `toggleThreadHide`) ·
//       delete thread (consequence-naming confirm, committed after the Undo
//       window) · the thread's own ⋯ menu
// The arrangement (part rects, parked/removed parts) and the camera live on
// the room row (`metadata.spatial_layout`, debounced) — see `boardLayout.ts`.
//
// The board is an agent SURFACE (`SpatialBoardSurface`, stacked inside the War
// Room's own surface, which stays mounted in `WarRoomShell`): the board tools
// act on the parts through `roomBoardAgent.ts`, over this same layout path.

import { useEffect, useRef, useState } from "react";
import {
  Check,
  EyeOff,
  Focus,
  GripVertical,
  LayoutGrid,
  PanelsTopLeft,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { recordToast } from "@/lib/toast";
import { selectSubtasksByParent, selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectNoteContent, selectNoteContentLoadStatus } from "@/features/notes/redux/selectors";
import { updateNoteContent } from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { screenToWorld, type Rect } from "@/features/spatial/engine/camera";
import type { SpatialStore } from "@/features/spatial/engine/spatial-store";
import { useSpatialStore } from "@/features/spatial/engine/react";
import type { ThrowAction, ThrowDirection } from "@/features/spatial/engine/throw";
import type { TileStatusValue } from "@/features/spatial/streams/useSourceStatus";
import { useWheelModePreference } from "@/features/spatial/board/useWheelModePreference";
import { SpatialViewport } from "@/features/spatial/components/SpatialViewport";
import { SpatialTile } from "@/features/spatial/components/SpatialTile";
import { SpatialFrame } from "@/features/spatial/components/SpatialFrame";
import { SpatialBoardMenu } from "@/features/spatial/components/SpatialBoardMenu";
import { ParkedShelf, type ParkedChip } from "@/features/spatial/components/ParkedShelf";
import { Minimap, ZoomHud } from "@/features/spatial/components/SpatialChrome";
import { SpatialBoardSurface } from "@/features/spatial/components/SpatialBoardSurface";
import type { BoardToolHost, Failure } from "@/features/spatial/tools/useBoardAgentTools";
import {
  selectActiveNoteId,
  selectAssignmentTokenSummary,
  selectAudioSessionIdsForThread,
  selectHiddenThreads,
  selectOrderedGalleryThreadIds,
  selectSessionById,
  selectThreadAnchorType,
  selectThreadById,
  selectThreadIdsForRoom,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";
import {
  deleteThread,
  persistRoomMetadataKey,
  toggleThreadHide,
} from "@/features/war-room/redux/thunks";
import { useThreadActions } from "@/features/war-room/hooks/useThreadActions";
import { useThreadPulse } from "@/features/war-room/hooks/useThreadPulse";
import { useThreadSearch } from "@/features/war-room/hooks/useThreadSearch";
import { deriveThreadTabs } from "@/features/war-room/hooks/useThreadTabs";
import type { ThreadAnchorType, ThreadTab } from "@/features/war-room/types";
import { ThreadTabContent } from "../thread/ThreadTabContent";
import { ThreadOptionsMenu } from "../thread/ThreadOptionsMenu";
import { dynamicTabKind } from "../room/threadKind";
import { useRoomView } from "../room/roomViewContext";
import {
  BOARD_LAYOUT_KEY,
  FRAME_HEADER_H,
  type BoardLayout,
  type ThreadParts,
  boardPartTabs,
  isPartKey,
  parseBoardLayout,
  parsePartKey,
  partKey,
  placeMissingParts,
  serializeBoardLayout,
  threadFrame,
  withPartState,
} from "./boardLayout";
import { type RoomPartTile, useRoomBoardToolHost } from "./roomBoardAgent";

const SAVE_DEBOUNCE_MS = 800;
/** Flying to a frame leaves room for its title, which sits above it. */
const FRAME_FIT_PADDING = 120;
/** How long a thread delete can be undone before it is committed. */
const DELETE_UNDO_MS = 6000;

const PART_THROWS: Record<ThrowDirection, ThrowAction> = {
  right: "park",
  down: "remove",
  up: "none",
  left: "none",
};

function threadTitle(title: string | null | undefined): string {
  return title?.trim() || "Untitled thread";
}

/** Every visible thread's board tabs, as one comparable string (`id=a,b|…`). */
function boardTabsKey(state: RootState, ids: readonly string[]): string {
  return ids
    .map(
      (id) =>
        `${id}=${boardPartTabs(deriveThreadTabs(selectAssignmentTokenSummary(id)(state))).join(",")}`,
    )
    .join("|");
}

function parseTabsKey(key: string): ThreadParts[] {
  if (!key) return [];
  return key.split("|").map((entry) => {
    const eq = entry.indexOf("=");
    const tabs = entry.slice(eq + 1);
    return {
      threadId: entry.slice(0, eq),
      tabs: (tabs ? tabs.split(",") : []) as ThreadTab[],
    };
  });
}

type HiddenState = "board" | "parked" | "removed";

export function RoomBoardView({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const appStore = useAppStore();
  const session = useAppSelector(selectSessionById(sessionId));
  const orderedIds = useAppSelector(selectOrderedGalleryThreadIds(sessionId));
  const roomThreadIds = useAppSelector(selectThreadIdsForRoom(sessionId));
  const hiddenThreads = useAppSelector(selectHiddenThreads(sessionId));
  const { threadQuery, stageThread } = useRoomView();

  // Thread deletes waiting out their Undo window leave the board at once.
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(() => new Set());
  const visibleIds = orderedIds.filter((id) => !deleting.has(id));
  const tabsKey = useAppSelector((s) => boardTabsKey(s, visibleIds));
  const threads = parseTabsKey(tabsKey);

  const [store, setStore] = useState<SpatialStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();

  // ── the remembered arrangement ─────────────────────────────────────────
  const [saved] = useState(() => parseBoardLayout(session?.metadata));
  const cameraRef = useRef(saved.camera);
  const [layout, setLayout] = useState<BoardLayout>(() => {
    const first = parseTabsKey(boardTabsKey(appStore.getState(), visibleIds));
    const placed = placeMissingParts(first, saved.parts);
    // Untouched when nothing was placed, so opening a board never writes.
    return Object.keys(placed).length === 0
      ? saved
      : { ...saved, parts: { ...saved.parts, ...placed } };
  });
  // A part nobody has placed yet (a new attachment tab, a new thread) gets a
  // rect during render — in its frame's free space, or the next free frame
  // slot nearest to where you are looking.
  const missing = placeMissingParts(threads, layout.parts, viewCentre(store));
  if (Object.keys(missing).length > 0) {
    setLayout((l) => ({ ...l, parts: { ...l.parts, ...missing } }));
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ layout, roomThreadIds });
  useEffect(() => {
    latest.current = { layout, roomThreadIds };
  });

  const flushSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const { layout: l, roomThreadIds: ids } = latest.current;
    // The camera is recorded only by the frame subscription below — once it
    // has really moved — so a save before the first fit never stores the
    // viewport's placeholder camera.
    void dispatch(
      persistRoomMetadataKey(
        sessionId,
        BOARD_LAYOUT_KEY,
        serializeBoardLayout({ ...l, camera: cameraRef.current }, ids),
      ),
    );
  };
  const flushRef = useRef(flushSave);
  const scheduleRef = useRef(() => {});
  useEffect(() => {
    flushRef.current = flushSave;
    scheduleRef.current = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flushRef.current(), SAVE_DEBOUNCE_MS);
    };
  });

  // Every arrangement change is remembered — including the first placement
  // of a board nobody arranged yet, so it is stable on the next visit.
  useEffect(() => {
    if (layout === saved) return;
    scheduleRef.current();
  }, [layout, saved]);

  // A camera move is remembered too (only a real change schedules a write).
  useEffect(() => {
    if (!store) return;
    return store.subscribeFrame(() => {
      const c = store.getCamera();
      const prev = cameraRef.current;
      if (
        prev &&
        Math.abs(prev.x - c.x) < 1 &&
        Math.abs(prev.y - c.y) < 1 &&
        Math.abs(prev.z - c.z) / c.z < 0.005
      )
        return;
      cameraRef.current = c;
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

  // ── where the camera should fly after a restore ─────────────────────────
  // A part or thread restored from the shelf / Parts menu / Undo: fly to it
  // once it is back on the board.
  const [pendingFly, setPendingFly] = useState<string | null>(null);
  const flyPart = pendingFly ? parsePartKey(pendingFly) : null;
  const flyReady =
    !!pendingFly &&
    (flyPart
      ? threads.some((t) => t.threadId === flyPart.threadId) &&
        !layout.parked.includes(pendingFly) &&
        !layout.removed.includes(pendingFly)
      : threads.some((t) => t.threadId === pendingFly));
  useEffect(() => {
    if (!flyReady || !store || !pendingFly) return;
    const id = pendingFly;
    const raf = requestAnimationFrame(() => {
      setPendingFly(null);
      if (isPartKey(id)) {
        store.select(id);
        store.fitItem(id);
      } else store.fitItem(`frame:${id}`, FRAME_FIT_PADDING);
    });
    return () => cancelAnimationFrame(raf);
  }, [flyReady, store, pendingFly]);

  // The header search flies to the best match's frame.
  const matches = useThreadSearch(sessionId, visibleIds, threadQuery);
  const bestMatch = threadQuery.trim() ? (matches[0] ?? null) : null;
  useEffect(() => {
    if (!store || !bestMatch) return;
    store.fitItem(`frame:${bestMatch}`, FRAME_FIT_PADDING);
  }, [store, bestMatch]);

  // ── actions ────────────────────────────────────────────────────────────
  const titleOf = (threadId: string) =>
    threadTitle(appStore.getState().warRoom.threadsById[threadId]?.title);
  const partLabel = (key: string) => {
    const p = parsePartKey(key);
    if (!p) return "Part";
    const anchor = selectThreadAnchorType(p.threadId)(appStore.getState());
    return `${dynamicTabKind(p.tab, anchor).label} · ${titleOf(p.threadId)}`;
  };

  /** A part's toast names its thread (the record it belongs to). */
  const partRecord = (key: string) => {
    const id = parsePartKey(key)?.threadId ?? key;
    return { type: "thread", id, title: titleOf(id) };
  };

  const movePart = (key: string, x: number, y: number) =>
    setLayout((l) => {
      const cur = l.parts[key];
      if (!cur) return l;
      return { ...l, parts: { ...l.parts, [key]: { ...cur, x, y } } };
    });

  /** Move a whole frame: every part of the thread, from where the drag began. */
  const moveThread = (start: Record<string, Rect>, dx: number, dy: number) =>
    setLayout((l) => {
      const parts = { ...l.parts };
      for (const [key, r] of Object.entries(start)) parts[key] = { ...r, x: r.x + dx, y: r.y + dy };
      return { ...l, parts };
    });

  const setPartState = (key: string, state: HiddenState) => setLayout((l) => withPartState(l, key, state));

  /** An agent's change: applied to the live ref at once, so the next tool call
   * in the same tick reads it, then rendered and saved like a person's. */
  const commitLayout = (next: BoardLayout) => {
    latest.current = { ...latest.current, layout: next };
    setLayout(next);
  };

  const restorePart = (key: string) => {
    setPendingFly(key);
    setPartState(key, "board");
  };

  const toastParked = (key: string) =>
    recordToast.message(partRecord(key), `Parked "${partLabel(key)}"`, {
      action: { label: "Undo", onClick: () => restorePart(key) },
    });

  const parkPart = (key: string) => {
    setPartState(key, "parked");
    toastParked(key);
  };

  const removePart = (key: string) => {
    setPartState(key, "removed");
    recordToast.message(
      partRecord(key),
      `Took "${partLabel(key)}" off the board — nothing was deleted. Bring it back from the thread's Parts menu.`,
      { action: { label: "Undo", onClick: () => restorePart(key) } },
    );
  };

  const unparkThread = (id: string) => {
    setPendingFly(id);
    void dispatch(toggleThreadHide(id, false));
  };

  const parkThread = (id: string) => {
    const title = titleOf(id);
    void dispatch(toggleThreadHide(id, true));
    recordToast.message({ type: "thread", id, title }, `Parked "${title}"`, {
      action: { label: "Undo", onClick: () => unparkThread(id) },
    });
  };

  const deleteWholeThread = async (id: string) => {
    const title = titleOf(id);
    const ok = await confirm({
      title: `Delete "${title}" from this War Room?`,
      description:
        "The thread and every part of it leave this room. Its task, notes, recordings, files and chats stay safe in their own features. You can undo for a few seconds.",
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
          setPendingFly(id);
          setDeleting((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    });
  };

  const onThrow = (key: string, direction: ThrowDirection) => {
    const action = PART_THROWS[direction];
    if (action === "park") parkPart(key);
    else if (action === "remove") removePart(key);
  };

  const unpark = (id: string) => (isPartKey(id) ? restorePart(id) : unparkThread(id));

  const parkedSet = new Set(layout.parked);
  const removedSet = new Set(layout.removed);
  const visibleSet = new Set(visibleIds);
  const partState = (key: string): HiddenState =>
    parkedSet.has(key) ? "parked" : removedSet.has(key) ? "removed" : "board";

  const parkedChips: ParkedChip[] = [
    ...layout.parked
      .filter((key) => visibleSet.has(parsePartKey(key)?.threadId ?? ""))
      .map((key) => ({ id: key, title: partLabel(key), icon: LayoutGrid })),
    ...hiddenThreads.map((t) => ({ id: t.id, title: threadTitle(t.title), icon: PanelsTopLeft })),
  ];

  // ── the board's agent tools (board_read, board_move_tiles, board_park…) ──
  const writeNote = (threadId: string, text: string): Failure | null => {
    const state = appStore.getState();
    const noteId = selectActiveNoteId(threadId)(state);
    if (!noteId) {
      return {
        ok: false,
        error: `"${titleOf(threadId)}" has no note yet. Creating one is the person's choice — ask them to press "New Note" in the thread's Notes part, then write it.`,
      };
    }
    if (
      selectNoteContent(noteId)(state) === undefined &&
      selectNoteContentLoadStatus(noteId)(state) !== "loaded"
    ) {
      void dispatch(fetchNoteContent(noteId));
      return { ok: false, error: `The note of "${titleOf(threadId)}" is still loading — try again in a moment.` };
    }
    dispatch(updateNoteContent({ id: noteId, content: text }));
    return null;
  };

  const roomTools = useRoomBoardToolHost({
    getLayout: () => latest.current.layout,
    commit: commitLayout,
    threads,
    threadTitle: titleOf,
    partLabel: (threadId, tab) =>
      dynamicTabKind(tab, selectThreadAnchorType(threadId)(appStore.getState())).label,
    onParked: toastParked,
    restore: restorePart,
    writeNote,
    statusOf: (threadId, tab) => partStatus(appStore.getState(), threadId, tab),
  });
  const agentHost: BoardToolHost<RoomPartTile> = {
    ...roomTools,
    store,
    boardTitle: session?.title?.trim() || "War Room",
  };

  return (
    <SpatialBoardSurface host={agentHost}>
      <SpatialBoardMenu
        store={store}
        actions={{ park: parkPart, remove: removePart, removeLabel: "Remove from board…" }}
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
              {threads.length === 0 && (
                <div
                  data-spatial-chrome
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-md"
                >
                  {/* read-gate-exempt: WarRoomShell renders this board only when the room's thread read is "ready"; a failed read shows ReadFailure there instead */}
                  {hiddenThreads.length > 0
                    ? "Every thread is parked — restore one from the shelf."
                    : "No threads yet — add one from Stage or Grid."}
                </div>
              )}
            </>
          }
        >
          {threads.map((t) => (
            <BoardThreadFrame
              key={t.threadId}
              threadId={t.threadId}
              sessionId={sessionId}
              tabs={t.tabs}
              parts={layout.parts}
              partState={partState}
              onMovePart={movePart}
              onMoveThread={moveThread}
              onThrow={onThrow}
              onRestorePart={restorePart}
              onFlyToPart={(key) => {
                store?.select(key);
                store?.fitItem(key);
              }}
              onPark={parkThread}
              onDelete={(id) => void deleteWholeThread(id)}
              onStage={stageThread}
            />
          ))}
        </SpatialViewport>
      </SpatialBoardMenu>
    </SpatialBoardSurface>
  );
}

/** A part's status word for board_read — the same readings its tile shows. */
function partStatus(state: RootState, threadId: string, tab: ThreadTab): string | null {
  if (tab === "audio") {
    const c = state.recordings.context;
    if (!c || c.kind !== "studio" || !selectAudioSessionIdsForThread(threadId)(state).includes(c.sessionId)) return null;
    return state.recordings.isRecording ? "recording" : state.recordings.isTranscribing ? "transcribing" : null;
  }
  if (tab === "task") {
    const taskId = selectThreadTaskId(threadId)(state);
    if (!taskId) return null;
    const subtasks = selectSubtasksByParent(state, taskId);
    if (subtasks.length > 0) {
      return `${subtasks.filter((t) => t.status === "completed").length}/${subtasks.length} done`;
    }
    return selectTaskById(state, taskId)?.status === "completed" ? "done" : "active";
  }
  return null;
}

/** World point at the centre of what you are looking at. */
function viewCentre(store: SpatialStore | null): { x: number; y: number } | undefined {
  if (!store) return undefined;
  const { w, h } = store.getSize();
  if (w <= 0 || h <= 0) return undefined;
  return screenToWorld(store.getCamera(), w / 2, h / 2);
}

// ── one thread: its frame, its header, its parts ─────────────────────────

function BoardThreadFrame({
  threadId,
  sessionId,
  tabs,
  parts,
  partState,
  onMovePart,
  onMoveThread,
  onThrow,
  onRestorePart,
  onFlyToPart,
  onPark,
  onDelete,
  onStage,
}: {
  threadId: string;
  sessionId: string;
  tabs: readonly ThreadTab[];
  parts: Readonly<Record<string, Rect>>;
  partState: (key: string) => HiddenState;
  onMovePart: (key: string, x: number, y: number) => void;
  onMoveThread: (start: Record<string, Rect>, dx: number, dy: number) => void;
  onThrow: (key: string, direction: ThrowDirection) => void;
  onRestorePart: (key: string) => void;
  onFlyToPart: (key: string) => void;
  onPark: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onStage: (threadId: string) => void;
}) {
  const thread = useAppSelector(selectThreadById(threadId));
  const anchorType = useAppSelector(selectThreadAnchorType(threadId));
  const frame = threadFrame(threadId, tabs, parts);
  if (!frame) return null;
  const title = threadTitle(thread?.title);

  return (
    <>
      <SpatialFrame id={threadId} rect={frame} title={title} />
      <BoardFrameHeader
        threadId={threadId}
        sessionId={sessionId}
        frame={frame}
        tabs={tabs}
        parts={parts}
        anchorType={anchorType}
        partState={partState}
        onMoveThread={onMoveThread}
        onRestorePart={onRestorePart}
        onFlyToPart={onFlyToPart}
        onPark={onPark}
        onDelete={onDelete}
        onStage={onStage}
      />
      {tabs.map((tab) => {
        const key = partKey(threadId, tab);
        const rect = parts[key];
        if (!rect || partState(key) !== "board") return null;
        return (
          <BoardPartTile
            key={key}
            partId={key}
            threadId={threadId}
            sessionId={sessionId}
            threadTitle={title}
            tab={tab}
            anchorType={anchorType}
            rect={rect}
            onMove={onMovePart}
            onThrow={onThrow}
          />
        );
      })}
    </>
  );
}

const IDLE: TileStatusValue = { status: "idle", progress: null };

function BoardPartTile({
  partId,
  threadId,
  sessionId,
  threadTitle: owner,
  tab,
  anchorType,
  rect,
  onMove,
  onThrow,
}: {
  partId: string;
  threadId: string;
  sessionId: string;
  threadTitle: string;
  tab: ThreadTab;
  anchorType: ThreadAnchorType;
  rect: Rect;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
}) {
  const pulse = useThreadPulse(threadId);
  const kind = dynamicTabKind(tab, anchorType);
  // Each part carries the reading that belongs to it: the recorder is live on
  // Audio, the task's progress on Task; everything else is idle.
  const status: TileStatusValue =
    tab === "audio" && pulse.isRecording
      ? { status: "streaming", progress: null }
      : tab === "task" && pulse.hasTask && pulse.taskDone
        ? { status: "complete", progress: 1 }
        : tab === "task" && pulse.subtaskTotal > 0
          ? { status: "queued", progress: pulse.subtaskDone / pulse.subtaskTotal }
          : IDLE;

  return (
    <SpatialTile
      id={partId}
      rect={rect}
      title={kind.label}
      subtitle={owner}
      icon={kind.Icon}
      statusFrom={{ kind: "static", value: status }}
      onMove={onMove}
      onThrow={onThrow}
      throwActions={PART_THROWS}
    >
      {() => (
        <div className={cn("h-full min-h-0 overflow-hidden border-l-[3px]", kind.sectionBorder)}>
          <ThreadTabContent tab={tab} threadId={threadId} sessionId={sessionId} threadLayout="stage" />
        </div>
      )}
    </SpatialTile>
  );
}

// ── the frame header: the thread's own controls, once per thread ─────────

const HEADER_INSET = 20;
/** Below this zoom the header counter-scales to stay readable… */
const HEADER_READ_Z = 0.9;
/** …up to this factor: 20 + 48 × 2.2 < the 128px band above the parts. */
const HEADER_MAX_SCALE = 2.2;

function BoardFrameHeader({
  threadId,
  sessionId,
  frame,
  tabs,
  parts,
  anchorType,
  partState,
  onMoveThread,
  onRestorePart,
  onFlyToPart,
  onPark,
  onDelete,
  onStage,
}: {
  threadId: string;
  sessionId: string;
  frame: Rect;
  tabs: readonly ThreadTab[];
  parts: Readonly<Record<string, Rect>>;
  anchorType: ThreadAnchorType;
  partState: (key: string) => HiddenState;
  onMoveThread: (start: Record<string, Rect>, dx: number, dy: number) => void;
  onRestorePart: (key: string) => void;
  onFlyToPart: (key: string) => void;
  onPark: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onStage: (threadId: string) => void;
}) {
  const store = useSpatialStore();
  const actions = useThreadActions(threadId, sessionId);
  const drag = useRef<{ px: number; py: number; start: Record<string, Rect> } | null>(null);
  if (!actions) return null;

  const onBoard = tabs.filter((tab) => partState(partKey(threadId, tab)) === "board").length;

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, [role=menuitem]")) return;
    const start: Record<string, Rect> = {};
    for (const tab of tabs) {
      const key = partKey(threadId, tab);
      if (parts[key]) start[key] = parts[key];
    }
    drag.current = { px: e.clientX, py: e.clientY, start };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const z = store.getCamera().z;
    onMoveThread(d.start, (e.clientX - d.px) / z, (e.clientY - d.py) / z);
  };
  const up = () => {
    drag.current = null;
  };

  const iconBtn =
    "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div
      data-spatial-chrome
      data-board-frame-header={threadId}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      title="Drag to move this thread and all its parts"
      className="absolute flex max-w-none cursor-grab touch-none items-center gap-1 rounded-lg border border-border bg-card px-1.5 shadow-sm active:cursor-grabbing"
      style={{
        left: frame.x + HEADER_INSET,
        top: frame.y + HEADER_INSET,
        height: FRAME_HEADER_H - 8,
        // Readable when zoomed out: grows as the board shrinks, capped so it
        // never reaches the parts below the header band.
        transform: `scale(clamp(1, calc(${HEADER_READ_Z} / var(--spatial-z, 1)), ${HEADER_MAX_SCALE}))`,
        transformOrigin: "top left",
      }}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={actions.togglePin}
        title={actions.isPinned ? "Unpin thread" : "Pin thread"}
        aria-label={actions.isPinned ? "Unpin thread" : "Pin thread"}
        className={cn(iconBtn, actions.isPinned && "text-primary")}
      >
        {actions.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Parts of this thread"
          >
            <LayoutGrid className="size-4" />
            Parts {onBoard}/{tabs.length}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            On the board, parked, or taken off
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tabs.map((tab) => {
            const key = partKey(threadId, tab);
            const state = partState(key);
            const kind = dynamicTabKind(tab, anchorType);
            return (
              <DropdownMenuItem
                key={key}
                className="gap-2"
                onClick={() => (state === "board" ? onFlyToPart(key) : onRestorePart(key))}
              >
                <kind.Icon className={cn("size-3.5 shrink-0", kind.text)} />
                <span className="flex-1 truncate">{kind.label}</span>
                {state === "board" ? (
                  <Check className="size-3.5 shrink-0 text-muted-foreground" aria-label="On the board" />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {state === "parked" ? "Parked — restore" : "Off — restore"}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" onClick={() => onStage(threadId)} title="Open in Stage" aria-label="Open in Stage" className={iconBtn}>
        <Focus className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onPark(threadId)}
        title="Park thread (hide it from the room)"
        aria-label="Park thread"
        className={iconBtn}
      >
        <EyeOff className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(threadId)}
        title="Delete thread from this room…"
        aria-label="Delete thread"
        className={cn(iconBtn, "hover:text-destructive")}
      >
        <Trash2 className="size-4" />
      </button>
      <ThreadOptionsMenu actions={actions} threadId={threadId} onStage={() => onStage(threadId)} size="md" />
    </div>
  );
}
