"use client";

// features/war-room/components/room/StageTile.tsx
//
// The hero focus pane: the ONE thread the user is driving right now. Full
// height, a rich two-row header (identity + live status + metric chips, then the
// labeled view switcher), then the real tab body fills everything below. This is
// "your place" — the thing the rail snaps threads into. It carries full working
// state, so resuming is instant and lossless. Honors the room-wide instrument
// projector (shows the projected tab without mutating the saved one) and wears
// the kind accent rail like every other tile.

import { Maximize2, Pin } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setTileActiveTabPersisted } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { EditableTitle } from "../shared/EditableTitle";
import { TileContextOverride } from "../tile/TileContextOverride";
import { TileTabBar } from "../tile/TileTabBar";
import { TileTabContent } from "../tile/TileTabContent";
import { TileMetricChips } from "../tile/TileMetricChips";
import { TileOptionsMenu } from "../tile/TileOptionsMenu";
import { PulseGlyph } from "../tile/PulseGlyph";
import { useTilePulse } from "@/features/war-room/hooks/useTilePulse";
import { useTileActions } from "@/features/war-room/hooks/useTileActions";
import { useTileMetrics } from "@/features/war-room/hooks/useTileMetrics";
import { useRoomView } from "./roomViewContext";
import { tileKindOf } from "./tileKind";

export function StageTile({
  tileId,
  sessionId,
}: {
  tileId: string;
  sessionId: string;
}) {
  const dispatch = useAppDispatch();
  const pulse = useTilePulse(tileId);
  const metrics = useTileMetrics(tileId);
  const actions = useTileActions(tileId, sessionId);
  const { projectedTab } = useRoomView();
  if (!actions) return null;

  const shownTab = projectedTab ?? actions.activeTab;
  const kind = tileKindOf(shownTab);

  return (
    <div className="@container relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--elevation-2)]">
      {/* Accent rail keyed to the shown view. Neutral on "All" — section rails
          inside TileTabContent carry per-kind color for the full stack. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-2xl opacity-80",
          shownTab === "combined" ? "bg-border/70" : kind.rail,
        )}
      />

      {/* Identity row */}
      <div className="shrink-0 flex items-center gap-2.5 pl-4 pr-3.5 pt-3 pb-2">
        <span className="shrink-0">
          <PulseGlyph pulse={pulse} size={26} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {actions.isPinned ? (
              <Pin className="size-3.5 shrink-0 text-primary fill-primary/20" />
            ) : null}
            <EditableTitle
              value={actions.title}
              onSave={actions.rename}
              placeholder="Untitled thread"
              className="text-[15px] font-semibold"
              inputClassName="text-[15px] font-semibold"
            />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span>{pulse.headline}</span>
            <span className="hidden @sm:block">
              <TileMetricChips m={metrics} />
            </span>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <TileContextOverride tileId={tileId} />
          {actions.canExpand ? (
            <button
              type="button"
              onClick={actions.expand}
              title="Open the full view"
              className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Maximize2 className="size-4" />
            </button>
          ) : null}
          <TileOptionsMenu actions={actions} isStaged size="md" />
        </div>
      </div>

      {/* View switcher row */}
      <div className="shrink-0 pl-4 pr-3.5 pb-2.5">
        <TileTabBar
          active={shownTab}
          onChange={(tab) => dispatch(setTileActiveTabPersisted(tileId, tab))}
          withLabels
          size="md"
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 border-t border-border/60 bg-card">
        <TileTabContent tab={shownTab} tileId={tileId} sessionId={sessionId} />
      </div>
    </div>
  );
}
