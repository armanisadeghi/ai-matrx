"use client";

// features/war-room/components/room/RailTile.tsx
//
// The peripheral "instrument": a compact, LIVE summary of one thread that sits
// in the Stage rail (a watchlist row). It shows the real pulse (PulseGlyph), the
// thread title, a one-word status headline, and a content snippet — all
// read-only. Click it to bring it to the Stage instantly with full working
// state (no context lost). It is read, not operated; operating happens on the
// Stage. The kind accent edge keys it to the thread type.

import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTilePulse } from "@/features/war-room/hooks/useTilePulse";
import { useTileActions } from "@/features/war-room/hooks/useTileActions";
import { PulseGlyph } from "../tile/PulseGlyph";
import { TileOptionsMenu } from "../tile/TileOptionsMenu";
import { tileKindOf } from "./tileKind";

export function RailTile({
  tileId,
  sessionId,
  isStaged,
  onStage,
}: {
  tileId: string;
  sessionId: string;
  isStaged: boolean;
  onStage: () => void;
}) {
  const pulse = useTilePulse(tileId);
  const actions = useTileActions(tileId, sessionId);
  if (!actions) return null;

  const kind = tileKindOf(pulse.activeTab);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStage}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStage();
        }
      }}
      className={cn(
        "group/rail relative flex items-start gap-2.5 rounded-xl border pl-3 pr-2.5 py-2 text-left transition-all duration-150 cursor-pointer overflow-hidden",
        isStaged
          ? "border-primary/60 bg-primary/[0.06] shadow-[var(--elevation-1)]"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      {/* Left edge marker: primary when staged, else the kind accent. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-colors",
          isStaged ? "bg-primary" : cn(kind.rail, "opacity-70"),
        )}
      />

      <span className="mt-0.5 shrink-0">
        <PulseGlyph pulse={pulse} size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {actions.isPinned ? (
            <Pin className="size-3 shrink-0 text-primary fill-primary/20" />
          ) : null}
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {actions.title}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="shrink-0 font-medium">{pulse.headline}</span>
          {pulse.preview ? (
            <>
              <span className="text-border">·</span>
              <span className="min-w-0 truncate">{pulse.preview}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Options reveal on hover / when staged. */}
      <div
        className={cn(
          "shrink-0 transition-opacity",
          isStaged
            ? "opacity-100"
            : "opacity-0 group-hover/rail:opacity-100 focus-within:opacity-100",
        )}
      >
        <TileOptionsMenu actions={actions} isStaged={isStaged} />
      </div>
    </div>
  );
}
