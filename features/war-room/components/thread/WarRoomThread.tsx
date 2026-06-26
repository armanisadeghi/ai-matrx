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

import { useState } from "react";
import { Pin, Focus, GripVertical } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTileFlavor } from "@/features/war-room/redux/selectors";
import { setTileActiveTabPersisted } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import type { ThreadDragHandle } from "../room/threadDrag";
import { EditableTitle } from "../shared/EditableTitle";
import { TileContextOverride } from "./TileContextOverride";
import { TileFlavorBadge } from "./TileFlavorBadge";
import { TileProjectMarker } from "./TileProjectMarker";
import { TileTabSelect } from "./TileTabSelect";
import { TileTabContent } from "./TileTabContent";
import { TileMetricChips } from "./TileMetricChips";
import { TileOptionsMenu } from "./TileOptionsMenu";
import { TileCopyForAiButton } from "../shared/TileCopyForAiButton";
import { useTileActions } from "@/features/war-room/hooks/useTileActions";
import { useTileMetrics } from "@/features/war-room/hooks/useTileMetrics";
import { useRoomView } from "../room/roomViewContext";
import { tileTabKind } from "../room/tileKind";

export function WarRoomTile({
  tileId,
  sessionId,
  featured,
  onStage,
  /** When supplied (Feature e007e2fc), a drag grip in the header reorders the
   *  grid; the double-click / focus button still stage the tile. */
  dragHandle,
}: {
  tileId: string;
  sessionId: string;
  featured?: boolean;
  /** Promote this tile to the Stage (Grid mode only). */
  onStage?: () => void;
  dragHandle?: ThreadDragHandle;
}) {
  const dispatch = useAppDispatch();
  const actions = useTileActions(tileId, sessionId);
  const metrics = useTileMetrics(tileId);
  const { projectedTab } = useRoomView();
  const [contextOpen, setContextOpen] = useState(false);
  const flavor = useAppSelector((s) => selectTileFlavor(tileId)(s));
  if (!actions) return null;

  // The board projector overrides what's SHOWN, never what's SAVED.
  const shownTab = projectedTab ?? actions.activeTab;
  const projected = projectedTab !== null && projectedTab !== actions.activeTab;
  const kind = tileTabKind(shownTab, flavor);

  return (
    <div
      onDoubleClick={onStage}
      className={cn(
        "group/tile @container relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200",
        shownTab === "combined"
          ? "border-l-[3px] border-l-border/70"
          : cn("border-l-[3px]", kind.sectionBorder),
        actions.isPinned
          ? "border-primary/40 shadow-[var(--elevation-2)] ring-1 ring-primary/15"
          : featured
            ? "border-border shadow-[var(--elevation-1)] hover:border-primary/30"
            : "border-border hover:border-primary/30 hover:shadow-[var(--elevation-1)]",
      )}
    >
      {/* Header — [pin] · TITLE (always wins space) · chips · view dropdown · focus · ⋯
          The leading kind icon is gone (the accent rail + the view dropdown's own
          icon already convey kind); the six-segment switcher collapsed into one
          dropdown; the context control moved into the ⋯ menu — all so the thread
          title stays readable even at 12 tiles. Nothing was removed, only moved. */}
      <div className="shrink-0 flex items-center gap-1.5 pl-2.5 pr-1.5 h-9 border-b border-border/70">
        {actions.isPinned ? (
          <Pin className="size-3 shrink-0 text-primary fill-primary/20" />
        ) : null}

        <EditableTitle
          value={actions.title}
          onSave={actions.rename}
          placeholder="Untitled thread"
          className="min-w-0 text-xs font-medium"
          inputClassName="min-w-0 text-xs font-medium"
        />

        {/* Project tiles: named link to /projects/[id]. Task tiles: quiet pill. */}
        {flavor === "project" ? (
          <TileProjectMarker tileId={tileId} />
        ) : (
          <TileFlavorBadge tileId={tileId} className="@max-[16rem]:hidden" />
        )}

        {/* Live readings — hide on the tightest cells (handled by the chips). */}
        <div className="ml-0.5 @max-[12rem]:hidden">
          <TileMetricChips m={metrics} />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span onClick={(e) => e.stopPropagation()}>
            <TileCopyForAiButton tileId={tileId} />
          </span>
          <TileTabSelect
            active={shownTab}
            flavor={flavor}
            onChange={(tab) => dispatch(setTileActiveTabPersisted(tileId, tab))}
          />

          {/* Drag to reorder — quiet until hover, alongside the focus control. */}
          {dragHandle ? (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Drag to reorder"
              aria-label="Drag to reorder thread"
              className="grid place-items-center size-6 shrink-0 rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/tile:opacity-100 cursor-grab active:cursor-grabbing touch-none"
              {...dragHandle.attributes}
              {...dragHandle.listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          ) : null}

          {/* Focus — quiet until hover so a wall of 12 reads calm. */}
          {onStage ? (
            <button
              type="button"
              onClick={onStage}
              title="Bring to stage"
              className="grid place-items-center size-6 shrink-0 rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/tile:opacity-100"
            >
              <Focus className="size-3.5" />
            </button>
          ) : null}

          <TileOptionsMenu
            actions={actions}
            tileId={tileId}
            onStage={onStage}
            onOpenContext={() => setContextOpen(true)}
            contextActive={metrics.contextOverridden}
          />
          {/* Anchor-only popover, opened from the ⋯ menu's Context item. */}
          <TileContextOverride
            tileId={tileId}
            open={contextOpen}
            onOpenChange={setContextOpen}
            hideTrigger
          />
        </div>
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
        <TileTabContent
          tab={shownTab}
          tileId={tileId}
          sessionId={sessionId}
          tileLayout="grid"
        />
      </div>
    </div>
  );
}
