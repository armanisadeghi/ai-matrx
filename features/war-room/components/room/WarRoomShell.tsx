"use client";

// features/war-room/components/room/WarRoomShell.tsx
//
// Top-level frame for one War Room session — the canonical room UI on the real
// /war-room/[id] route. A War Room is a COCKPIT, not a wall of equal cards:
// there is always one thread you can drive on the Stage with a live watchlist
// rail beside it, and a Grid mode for the all-at-once bento view.
//
// Mission control lives in the SHELL header via <RoomHeader> (PageHeader
// injection — core-route-headers conformance; no in-body <header>, no
// viewport-height math). The body is `h-full overflow-hidden` and starts below
// the glass via `pt-[var(--shell-header-h)]` (tiles carry interactive controls
// at the top, so nothing may slide behind the glass).
//
// Grafts consolidated here: the Stage⇄Grid model + rail/stage (reimagine), the
// instrument projector + live metric chips (dense), the Comfortable/Compact
// density dial + live active/parked meter (refine), and the parked-chip
// treatment in the rail/tray (sharp). Hydrates the REAL session
// (loadWarRoomSession) with real loading / empty / not-found states; all data
// flows through the warRoom thunks + selectors.

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildWarRoomRoomScope } from "@/features/war-room/lib/war-room-scope";
import { closeAllWatches } from "@/features/war-room/redux/watchSlice";
import { RoomRecordingController } from "@/features/war-room/components/room/RoomRecordingController";
import {
  selectOrderedGalleryThreadIds,
  selectSessionById,
  selectThreadsStatusForRoom,
} from "@/features/war-room/redux/selectors";
import {
  leaveWarRoomSession,
  loadWarRoomSession,
} from "@/features/war-room/redux/thunks";
import { RoomHeader } from "./RoomHeader";
import { StageView } from "./StageView";
import { WarRoomGallery } from "./WarRoomGallery";
import { useActiveThreadRestore } from "./useActiveThreadRestore";
import { useRoomUrlSync } from "./useRoomUrlSync";
import {
  RoomViewProvider,
  resolveStagedId,
  useRoomView,
  type RoomMode,
} from "./roomViewContext";
import { useWarRoomWriteHandlers } from "./useWarRoomWriteHandlers";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

// The TIER-2 ROOM agent panel — its floating WindowPanel wrapper plus the whole
// agent execution graph (via AgentConversationColumn). Lazy-load it so neither
// the heavy agent column NOR the window-panel lazy graph (100+ chunks) ships in
// the /war-room/[id] route bundle — it only loads the first time the user opens
// the panel. RoomAgentWindow owns the static WindowPanel import so the shell
// (which lives in the route's boot graph) never trips the window-panels
// bundle-leak guard.
const RoomAgentWindow = dynamic(() => import("./RoomAgentWindow"), {
  ssr: false,
  loading: () => null,
});

// The live-watch layer renders thread-agent conversations the room agent is
// messaging (one WindowPanel per open id, driven by the shared warRoomWatch
// slice). It pulls the agent column graph too, so it's lazy-loaded the same way.
// It self-hides when nothing is being watched — but must always be MOUNTED so a
// tool/toast `openWatch` can pop a window even when the Room Agent panel is
// closed. Reused as-is from the master surface (the slice is shared; the layer
// is just a renderer).
import { MasterWatchLayerDoor as MasterWatchLayer } from "@/features/war-room/components/master/MasterWatchLayerDoor";

export function WarRoomShell({ sessionId }: { sessionId: string }) {
  return (
    <RoomViewProvider>
      <WarRoomShellInner sessionId={sessionId} />
    </RoomViewProvider>
  );
}

function WarRoomShellInner({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const tilesStatus = useAppSelector(selectThreadsStatusForRoom(sessionId));
  const roomView = useRoomView();
  const { mode } = roomView;

  // ── Surface emitter (`matrx-user/war-room`) ──────────────────────────────
  // The shell owns the room's session state AND the ephemeral cockpit view
  // state, so it is the one place that can emit the full room scope. Built at
  // TRIGGER time from the live store + the live view context — never a render
  // snapshot. The thread agent panel nests a DEEPER provider, so while a tile's
  // agent is open the thread surface wins (by design).
  const store = useAppStore();
  const visibleThreadIdsForStage = useAppSelector(
    selectOrderedGalleryThreadIds(sessionId),
  );
  const getRoomScope = useCallback(
    () =>
      buildWarRoomRoomScope(store.getState(), sessionId, {
        mode: roomView.mode,
        projectedTab: roomView.projectedTab,
        density: roomView.density,
        stagedThreadId: resolveStagedId(
          roomView.chosenStageId,
          visibleThreadIdsForStage,
        ),
      }),
    [
      store,
      sessionId,
      roomView.mode,
      roomView.projectedTab,
      roomView.density,
      roomView.chosenStageId,
      visibleThreadIdsForStage,
    ],
  );

  // Write half of the same surface (manifest `writeTargets`) — the shell owns
  // the room's session state, so it is also the one place that can service an
  // agent's write. Handlers run the room's own thunks; see the hook.
  const getRoomWriteHandlers = useWarRoomWriteHandlers(sessionId);

  // Restore the room VIEW on open, two complementary layers:
  //   • URL params (thread + view + density) — the fast, shareable layer; a
  //     refresh or a copied link restores exactly what was on screen. Mounted
  //     FIRST so a `thread` param wins over the slower session-row seed.
  //   • session.active_tile_id — the durable server mirror of the last-focused
  //     thread (no URL needed); seeds when no `thread` param is present and
  //     persists the focus back (debounced).
  // The staged tile itself stays ephemeral view-state (roomViewContext); both
  // layers only MIRROR it.
  useRoomUrlSync(sessionId);
  useActiveThreadRestore(sessionId);

  // Room Agent panel — local state owns open/closed. Non-modal so the cockpit
  // stays visible and interactive while the user chats with the room agent.
  // The header toggle lives in RoomHeader; the window renders here.
  const [roomAgentOpen, setRoomAgentOpen] = useState(false);

  useEffect(() => {
    dispatch(loadWarRoomSession(sessionId));
    return () => {
      dispatch(leaveWarRoomSession(sessionId));
    };
  }, [sessionId, dispatch]);

  // Live-watch windows are ephemeral "this is happening right now" UI tied to
  // this room. Leaving the room unmounts MasterWatchLayer (windows vanish);
  // clear the shared slice too so returning doesn't re-pop every prior watch
  // window. (The /all view does the same on leave — only one room surface is
  // mounted at a time, so they never contend.)
  useEffect(() => {
    return () => {
      dispatch(closeAllWatches());
    };
  }, [dispatch]);

  const loading = tilesStatus === "loading" || tilesStatus === "idle";
  const notFound = tilesStatus === "error" && !session;
  const ready = tilesStatus === "ready";

  useEffect(() => {
    if (!ready || mode !== "stage") return;
    traceWarRoomRenderPath(2, "WarRoomShell.tsx", "Stage mode ready", {
      sessionId,
    });
  }, [ready, mode, sessionId]);

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/war-room"
      getScope={getRoomScope}
      getWriteHandlers={getRoomWriteHandlers}
    >
    <div className="@container h-full flex flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
      {/* ── Header — injected into the shell's glass row via <PageHeader>.
          Hides itself while a thread owns the route surface. ── */}
      <RoomHeader
        sessionId={sessionId}
        ready={ready}
        roomAgentOpen={roomAgentOpen}
        onToggleRoomAgent={() => setRoomAgentOpen((v) => !v)}
      />

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <RoomSkeleton mode={mode} />
        ) : notFound ? (
          <NotFoundState />
        ) : ready ? (
          mode === "stage" ? (
            <StageView sessionId={sessionId} />
          ) : (
            <WarRoomGallery sessionId={sessionId} />
          )
        ) : null}
      </div>

      {/* ── Room Agent — inline, draggable, NON-MODAL WindowPanel. Mounted only
          while open (closing unmounts the heavy agent column). Docked bottom-
          right on first open; the user can drag/resize from there. Inline-
          managed: `onClose` is the required close binding (no overlayId). ── */}
      {roomAgentOpen && (
        <RoomAgentWindow
          sessionId={sessionId}
          onClose={() => setRoomAgentOpen(false)}
        />
      )}

      {/* Live-watch layer — always mounted so a room-agent tool / toast can open
          a watch window for a thread agent even when the Room Agent panel is
          closed. Renders nothing until a conversation is being watched. Shares
          the warRoomWatch slice with the /all master surface (only one room
          surface is mounted at a time, so they never contend). */}
      <MasterWatchLayer />

      {/* Room-level recording ownership (D14): the controller — not the tile's
          CleanupPad — owns the active recording session, so a tile tab switch
          (which unmounts the pad) never tears the recording down. Renders
          nothing; registers its imperative API in roomRecordingBridge. */}
      <RoomRecordingController />
    </div>
    </SurfaceRuntimeProvider>
  );
}

function NotFoundState() {
  return (
    <div className="h-full grid place-items-center text-center px-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          War Room not found
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          It may have been deleted.
        </p>
      </div>
    </div>
  );
}

/** Mode-shaped loading skeleton — matches the real layout it's about to become. */
function RoomSkeleton({ mode }: { mode: RoomMode }) {
  if (mode === "grid") {
    return (
      <div className="h-full grid grid-cols-2 @3xl:grid-cols-3 gap-3 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card/60 animate-pulse"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col @4xl:flex-row gap-2.5 p-2.5 min-h-0">
      <aside className="shrink-0 flex flex-col gap-1.5 @4xl:w-[300px] @5xl:w-[340px]">
        <div className="h-4 w-16 rounded bg-muted/60 animate-pulse mb-1" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl border border-border bg-card/60 animate-pulse"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </aside>
      <main className="flex-1 min-h-0 @max-4xl:min-h-[50vh]">
        <div className="h-full rounded-2xl border border-border bg-card/60 animate-pulse" />
      </main>
    </div>
  );
}
