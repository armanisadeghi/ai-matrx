"use client";

// features/war-room/components/room/WarRoomShell.tsx
//
// Top-level frame for one War Room session — the canonical room UI on the real
// /war-room/[id] route. A War Room is a COCKPIT, not a wall of equal cards:
// there is always one thread you can drive on the Stage with a live watchlist
// rail beside it, and a Grid mode for the all-at-once bento view. The header is
// mission control:
//
//   ← · [icon] Title · live meter (●active ◦parked ⌖pinned) ┊ STAGE⇄GRID ┊
//      PROJECT all→one-view ┊ density ┊ context ┊ ⋯
//
// Grafts consolidated here: the Stage⇄Grid model + rail/stage (reimagine), the
// instrument projector + live metric chips (dense), the Comfortable/Compact
// density dial + live active/parked meter (refine), and the parked-chip
// treatment in the rail/tray (sharp). Hydrates the REAL session
// (loadWarRoomSession) with real loading / empty / not-found states; all data
// flows through the warRoom thunks + selectors.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Gauge,
  LayoutGrid,
  LayoutPanelLeft,
  MoreHorizontal,
  Trash2,
  Circle,
  Pin,
  EyeOff,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { closeAllWatches } from "@/features/war-room/redux/watchSlice";
import { cn } from "@/lib/utils";
import {
  selectHiddenTiles,
  selectOrderedGalleryTileIds,
  selectPinnedTileCount,
  selectSessionById,
  selectTilesStatusForSession,
} from "@/features/war-room/redux/selectors";
import {
  deleteSession,
  leaveWarRoomSession,
  loadWarRoomSession,
  renameSession,
} from "@/features/war-room/redux/thunks";
import { EditableTitle } from "../shared/EditableTitle";
import { SessionContextButton } from "./SessionContextButton";
import { RoomProjectButton } from "./RoomProjectButton";
import { StageView } from "./StageView";
import { WarRoomGallery } from "./WarRoomGallery";
import {
  RoomViewProvider,
  useRoomView,
  type RoomMode,
  type Density,
} from "./roomViewContext";
import { TILE_KIND_ORDER, tileKindOf } from "./tileKind";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

// The TIER-2 ROOM agent panel pulls the whole agent execution graph (via
// AgentConversationColumn). Lazy-load it so that heavy chunk never ships in the
// /war-room/[id] bundle — it only loads the first time the user opens the panel.
const RoomAgentPanel = dynamic(() => import("./RoomAgentPanel"), {
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
const MasterWatchLayer = dynamic(
  () =>
    import("@/features/war-room/components/master/MasterWatchLayer").then(
      (m) => m.MasterWatchLayer,
    ),
  { ssr: false, loading: () => null },
);

// Room Agent window size. Docked bottom-right on open (computed from the
// viewport in `initialRect` below).
const ROOM_AGENT_W = 460;
const ROOM_AGENT_H = 620;

export function WarRoomShell({ sessionId }: { sessionId: string }) {
  return (
    <RoomViewProvider>
      <WarRoomShellInner sessionId={sessionId} />
    </RoomViewProvider>
  );
}

function WarRoomShellInner({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const session = useAppSelector(selectSessionById(sessionId));
  const tilesStatus = useAppSelector(selectTilesStatusForSession(sessionId));
  const { mode } = useRoomView();

  // Room Agent panel — local state owns open/closed. Non-modal so the cockpit
  // stays visible and interactive while the user chats with the room agent.
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
    <div className="@container h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      {/* ── Header — pr-14 clears the shell's fixed top-right avatar ── */}
      <header className="shrink-0 border-b border-border pl-1.5 pr-14 h-11 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid place-items-center size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Back"
        >
          <ArrowLeft className="size-4.5" />
        </button>
        <span className="grid place-items-center size-7 shrink-0 text-primary">
          <Gauge className="size-4" />
        </span>

        {session ? (
          <EditableTitle
            value={session.title}
            onSave={(next) => dispatch(renameSession(sessionId, next))}
            placeholder="Untitled War Room"
            className="text-sm font-semibold max-w-[24ch]"
            inputClassName="text-sm font-semibold"
          />
        ) : (
          <h1 className="text-sm font-semibold text-foreground truncate">
            War Room
          </h1>
        )}

        {session && ready ? <LiveMeter sessionId={sessionId} /> : null}

        {session ? (
          <div className="ml-auto shrink-0 flex items-center gap-1.5">
            <ModeSwitch />
            {ready ? <InstrumentProjector /> : null}
            {ready ? <DensityDial /> : null}
            <RoomProjectButton sessionId={sessionId} />
            <SessionContextButton sessionId={sessionId} />
            <button
              type="button"
              onClick={() => setRoomAgentOpen((v) => !v)}
              aria-pressed={roomAgentOpen}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-7 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                roomAgentOpen
                  ? "text-primary border border-primary/70"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
              title="Chat with an agent that sees every thread in this room"
            >
              <Bot className="size-3.5 shrink-0" />
              <span className="@max-xl:hidden">Room Agent</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="War Room options"
                  className="grid place-items-center size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Delete this War Room?",
                      description: `"${session.title}" and its tile layout will be removed. The tasks, notes, and transcripts inside stay safe.`,
                      variant: "destructive",
                      confirmLabel: "Delete",
                    });
                    if (ok) {
                      await dispatch(deleteSession(sessionId));
                      router.push("/war-room/all");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete War Room
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>

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
        <WindowPanel
          id={`war-room-room-agent-${sessionId}`}
          title="Room Agent"
          titleNode={
            <span className="flex items-center gap-1.5 min-w-0">
              <Bot className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">Room Agent</span>
            </span>
          }
          onClose={() => setRoomAgentOpen(false)}
          width={ROOM_AGENT_W}
          height={ROOM_AGENT_H}
          minWidth={360}
          minHeight={420}
          initialRect={{
            x: Math.max(16, window.innerWidth - ROOM_AGENT_W - 24),
            y: Math.max(16, window.innerHeight - ROOM_AGENT_H - 24),
          }}
          bodyClassName="p-0"
        >
          <RoomAgentPanel sessionId={sessionId} />
        </WindowPanel>
      )}

      {/* Live-watch layer — always mounted so a room-agent tool / toast can open
          a watch window for a thread agent even when the Room Agent panel is
          closed. Renders nothing until a conversation is being watched. Shares
          the warRoomWatch slice with the /all master surface (only one room
          surface is mounted at a time, so they never contend). */}
      <MasterWatchLayer />
    </div>
  );
}

// ── Live meter — active / parked / pinned, straight from Redux ──────────────
function LiveMeter({ sessionId }: { sessionId: string }) {
  const visibleIds = useAppSelector(selectOrderedGalleryTileIds(sessionId));
  const hidden = useAppSelector(selectHiddenTiles(sessionId));
  const pinnedCount = useAppSelector(selectPinnedTileCount(sessionId));
  return (
    <div className="hidden @2xl:flex items-center gap-2 pl-2 ml-0.5 border-l border-border/60 text-[11px] tabular-nums text-muted-foreground shrink-0">
      <span
        className="inline-flex items-center gap-1"
        title={`${visibleIds.length} active thread${visibleIds.length === 1 ? "" : "s"}`}
      >
        <Circle className="size-2.5 fill-success text-success" />
        {visibleIds.length} active
      </span>
      {pinnedCount > 0 ? (
        <span
          className="inline-flex items-center gap-0.5 text-primary"
          title="Pinned threads"
        >
          <Pin className="size-3" />
          {pinnedCount}
        </span>
      ) : null}
      {hidden.length > 0 ? (
        <span
          className="inline-flex items-center gap-0.5"
          title={`${hidden.length} parked thread${hidden.length === 1 ? "" : "s"}`}
        >
          <EyeOff className="size-3" />
          {hidden.length} stowed
        </span>
      ) : null}
    </div>
  );
}

// ── Stage ⇄ Grid switch (reimagine) ─────────────────────────────────────────
function ModeSwitch() {
  const { mode, setMode } = useRoomView();
  const items: { id: RoomMode; label: string; Icon: typeof LayoutGrid }[] = [
    { id: "stage", label: "Stage", Icon: LayoutPanelLeft },
    { id: "grid", label: "Grid", Icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {items.map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            aria-pressed={active}
            title={`${label} view`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md h-7 px-2 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              active
                ? "bg-card text-primary shadow-[var(--elevation-1)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="@max-xl:hidden">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Instrument projector (dense) — set the whole room to one view ────────────
function InstrumentProjector() {
  const { projectedTab, setProjectedTab } = useRoomView();
  return (
    <div
      className="hidden @4xl:flex items-center gap-0.5 rounded-md border border-border/70 p-0.5"
      role="group"
      aria-label="Project all threads to one view"
      title="Project the whole room to one view"
    >
      {TILE_KIND_ORDER.map((id) => {
        const k = tileKindOf(id);
        const isOn = projectedTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setProjectedTab(isOn ? null : id)}
            aria-pressed={isOn}
            title={
              isOn ? `Stop projecting ${k.label}` : `Project all → ${k.label}`
            }
            className={cn(
              "grid place-items-center size-6 rounded transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isOn
                ? cn(k.text, "border border-current/70")
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <k.Icon className="size-3.5" />
          </button>
        );
      })}
      {projectedTab ? (
        <button
          type="button"
          onClick={() => setProjectedTab(null)}
          title="Return each thread to its own view"
          className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

// ── Density dial (refine) — Comfortable ⇄ Compact ───────────────────────────
function DensityDial() {
  const { density, setDensity } = useRoomView();
  const options: { id: Density; label: string; Icon: typeof Maximize2 }[] = [
    { id: "comfortable", label: "Comfortable", Icon: Maximize2 },
    { id: "compact", label: "Compact", Icon: Minimize2 },
  ];
  return (
    <div
      role="group"
      aria-label="Tile density"
      className="hidden @3xl:inline-flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5"
    >
      {options.map(({ id, label, Icon }) => {
        const active = id === density;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setDensity(id)}
            aria-pressed={active}
            title={label}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="@max-5xl:hidden">{label}</span>
          </button>
        );
      })}
    </div>
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
