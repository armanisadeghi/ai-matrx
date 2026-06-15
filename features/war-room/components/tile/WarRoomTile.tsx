"use client";

// features/war-room/components/tile/WarRoomTile.tsx
//
// The operable Grid-mode tile: a fully-working thread card (header + live tab
// body) for the bird's-eye gallery. It is the consolidated tile design —
//   • a kind-colored accent rail down the left edge (glance-read the thread type)
//   • live metric chips in the header (subtasks / note fill / transcript / scope)
//   • a segmented tab switcher; secondary chrome (context, ⋯) stays quiet until
//     hover so a wall of 12 reads calm
//   • the room-wide instrument PROJECTOR can force which tab renders without
//     mutating the tile's saved active_tab
//   • a double-click (or the header "focus" button) promotes it to the Stage
// All behavior runs through the shared useTileActions + the canonical tab
// bodies (TileTaskTab / TileNotesTab / TileAudioTab) — nothing reimplemented.

import { Pin, Focus } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setTileActiveTabPersisted } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { EditableTitle } from "../shared/EditableTitle";
import { TileContextOverride } from "./TileContextOverride";
import { TileFlavorBadge } from "./TileFlavorBadge";
import { TileTabBar } from "./TileTabBar";
import { TileTabContent } from "./TileTabContent";
import { TileMetricChips } from "./TileMetricChips";
import { TileOptionsMenu } from "./TileOptionsMenu";
import { useTileActions } from "@/features/war-room/hooks/useTileActions";
import { useTileMetrics } from "@/features/war-room/hooks/useTileMetrics";
import { useRoomView } from "../room/roomViewContext";
import { tileKindOf } from "../room/tileKind";

export function WarRoomTile({
  tileId,
  sessionId,
  featured,
  onStage,
}: {
  tileId: string;
  sessionId: string;
  featured?: boolean;
  /** Promote this tile to the Stage (Grid mode only). */
  onStage?: () => void;
}) {
  const dispatch = useAppDispatch();
  const actions = useTileActions(tileId, sessionId);
  const metrics = useTileMetrics(tileId);
  const { projectedTab } = useRoomView();
  if (!actions) return null;

  // The board projector overrides what's SHOWN, never what's SAVED.
  const shownTab = projectedTab ?? actions.activeTab;
  const projected = projectedTab !== null && projectedTab !== actions.activeTab;
  const kind = tileKindOf(shownTab);

  return (
    <div
      onDoubleClick={onStage}
      className={cn(
        "group/tile @container relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200",
        actions.isPinned
          ? "border-primary/40 shadow-[var(--elevation-2)] ring-1 ring-primary/15"
          : featured
            ? "border-border shadow-[var(--elevation-1)] hover:border-primary/30"
            : "border-border hover:border-primary/30 hover:shadow-[var(--elevation-1)]",
      )}
    >
      {/* Accent rail — glance-read the thread type without reading the title. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-xl opacity-80 transition-opacity group-hover/tile:opacity-100",
          kind.rail,
        )}
      />

      {/* Header — pin/icon · title · metric chips · tabs · context · focus · ⋯ */}
      <div className="shrink-0 flex items-center gap-1.5 pl-2.5 pr-1.5 h-9 border-b border-border/70">
        {actions.isPinned ? (
          <Pin className="size-3 shrink-0 text-primary fill-primary/20" />
        ) : (
          <kind.Icon className={cn("size-3.5 shrink-0", kind.text)} />
        )}

        <EditableTitle
          value={actions.title}
          onSave={actions.rename}
          placeholder="Untitled thread"
          className="min-w-0 text-xs font-medium"
          inputClassName="min-w-0 text-xs font-medium"
        />

        {/* Flavor marker (project / task) — quiet, hidden on the tightest cells. */}
        <TileFlavorBadge tileId={tileId} className="@max-[16rem]:hidden" />

        {/* Live readings — hide on the tightest cells (handled by the chips). */}
        <div className="ml-0.5 @max-[12rem]:hidden">
          <TileMetricChips m={metrics} />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <div className="@max-[15rem]:hidden">
            <TileTabBar
              active={shownTab}
              onChange={(tab) => dispatch(setTileActiveTabPersisted(tileId, tab))}
            />
          </div>

          {/* Secondary controls — quiet until hover so density reads calm. */}
          <div className="flex items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/tile:opacity-100">
            <TileContextOverride tileId={tileId} />
            {onStage ? (
              <button
                type="button"
                onClick={onStage}
                title="Bring to stage"
                className="grid place-items-center size-6 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Focus className="size-3.5" />
              </button>
            ) : null}
          </div>

          <TileOptionsMenu actions={actions} onStage={onStage} />
        </div>
      </div>

      {/* Compact tab row for very narrow cells where the header switcher hides. */}
      <div className="hidden @max-[15rem]:flex shrink-0 items-center justify-center px-2 py-1 border-b border-border/60">
        <TileTabBar
          active={shownTab}
          onChange={(tab) => dispatch(setTileActiveTabPersisted(tileId, tab))}
        />
      </div>

      {/* A faint banner only while the projector is overriding this tile's tab. */}
      {projected ? (
        <div className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 bg-muted/40 text-[10px] font-medium text-muted-foreground">
          <kind.Icon className={cn("size-2.5", kind.text)} />
          Projected · {kind.label}
        </div>
      ) : null}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TileTabContent tab={shownTab} tileId={tileId} sessionId={sessionId} />
      </div>
    </div>
  );
}
