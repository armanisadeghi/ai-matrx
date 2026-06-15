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

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
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
import { StageView } from "./StageView";
import { WarRoomGallery } from "./WarRoomGallery";
import {
  RoomViewProvider,
  useRoomView,
  type RoomMode,
  type Density,
} from "./roomViewContext";
import { TILE_KIND_ORDER, tileKindOf } from "./tileKind";

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

  useEffect(() => {
    dispatch(loadWarRoomSession(sessionId));
    return () => {
      dispatch(leaveWarRoomSession(sessionId));
    };
  }, [sessionId, dispatch]);

  const loading = tilesStatus === "loading" || tilesStatus === "idle";
  const notFound = tilesStatus === "error" && !session;
  const ready = tilesStatus === "ready";

  return (
    <div className="@container h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      {/* ── Header — pr-14 clears the shell's fixed top-right avatar ── */}
      <header className="shrink-0 border-b border-border pl-1.5 pr-14 h-11 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid place-items-center size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="size-4.5" />
        </button>
        <span className="grid place-items-center size-7 rounded-md bg-primary/10 text-primary shrink-0">
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
            <SessionContextButton sessionId={sessionId} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="War Room options"
                  className="grid place-items-center size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
            title={isOn ? `Stop projecting ${k.label}` : `Project all → ${k.label}`}
            className={cn(
              "grid place-items-center size-6 rounded transition-colors",
              isOn
                ? cn(k.bg, k.text)
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
          className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
        <p className="text-sm font-medium text-foreground">War Room not found</p>
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
