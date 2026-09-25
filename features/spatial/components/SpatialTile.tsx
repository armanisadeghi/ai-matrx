"use client";

/**
 * SpatialTile — one item on the plane, in WORLD coordinates.
 *
 * It owns three things and nothing else:
 *   1. Registration: its rect goes into the store for culling, fit and minimap.
 *   2. Culling: off-screen it keeps its React state (a stream keeps its
 *      place) but skips layout and paint via `content-visibility: hidden`.
 *   3. Semantic zoom: at overview tier the body is replaced by a title card
 *      whose type is COUNTER-SCALED (`--spatial-z`), so a 300-tile board is
 *      still a readable map instead of grey confetti.
 * The body is a render prop that receives the tile's pace tier, so each
 * content type decides how to use it (a stream paces commits, a video pauses
 * off-screen, an image swaps to a thumbnail…).
 */

import { type ReactNode, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rect } from "../engine/camera";
import type { PaceTier } from "../engine/lod";
import { usePaceTier, useSelectedTile, useSpatialStore } from "../engine/react";
import { type StatusFrom, type TileStatus, useTileStatus } from "../streams/useSourceStatus";

const IDLE_STATUS: StatusFrom = { kind: "static", value: { status: "idle", progress: null } };

const STATUS_DOT: Record<TileStatus, string> = {
  idle: "bg-muted-foreground/40",
  queued: "bg-muted-foreground/60",
  streaming: "bg-primary",
  complete: "bg-success",
  error: "bg-destructive",
};

const STATUS_LABEL: Record<TileStatus, string> = {
  idle: "Idle",
  queued: "Queued",
  streaming: "Live",
  complete: "Done",
  error: "Failed",
};

export interface SpatialTileProps {
  id: string;
  rect: Rect;
  title: string;
  /** Small line under the title (kind, source, model…). */
  subtitle?: string;
  icon?: LucideIcon;
  /** Where the status dot and overview card read from. Read in leaf
   * components only, so progress never re-renders the body. */
  statusFrom?: StatusFrom;
  /** Header actions (screen-sized buttons live in world space too). */
  actions?: ReactNode;
  /** Moves the tile, in world px. Header drag calls it; omit to pin the tile. */
  onMove?: (id: string, x: number, y: number) => void;
  children: (tier: PaceTier) => ReactNode;
}

export function SpatialTile({
  id,
  rect,
  title,
  subtitle,
  icon: Icon,
  statusFrom = IDLE_STATUS,
  actions,
  onMove,
  children,
}: SpatialTileProps) {
  const store = useSpatialStore();
  const tier = usePaceTier(id);
  const selected = useSelectedTile() === id;
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => store.registerItem(id, rect), [store, id, rect]);

  // Header drag moves the tile (world delta = screen delta / zoom).
  useEffect(() => {
    const header = headerRef.current;
    if (!header || !onMove) return;
    let start: { px: number; py: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      start = { px: e.clientX, py: e.clientY, x: rect.x, y: rect.y };
      store.select(id);
      header.setPointerCapture(e.pointerId);
      e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const z = store.getCamera().z;
      onMove(id, start.x + (e.clientX - start.px) / z, start.y + (e.clientY - start.py) / z);
    };
    const up = () => {
      start = null;
    };
    header.addEventListener("pointerdown", down);
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", up);
    header.addEventListener("pointercancel", up);
    return () => {
      header.removeEventListener("pointerdown", down);
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", up);
      header.removeEventListener("pointercancel", up);
    };
  }, [store, id, rect.x, rect.y, onMove]);

  const culled = tier === "offscreen";
  const overview = tier === "overview";

  return (
    <div
      data-spatial-tile={id}
      onPointerDown={() => store.select(id)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-spatial-scroll]")) return;
        store.fitItem(id);
      }}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow",
        selected ? "border-primary shadow-lg ring-2 ring-primary/30" : "border-border",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        contentVisibility: culled ? "hidden" : "visible",
      }}
    >
      <div
        ref={headerRef}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 border-b border-border px-3",
          onMove && "cursor-grab active:cursor-grabbing",
        )}
      >
        <StatusDot from={statusFrom} animate={tier === "read"} />
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </div>
        {subtitle && (
          <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
            {subtitle}
          </span>
        )}
        {actions}
      </div>
      <div className="relative min-h-0 flex-1" aria-hidden={overview}>
        {/* At overview the body stays mounted (a stream keeps its place) but
            is skipped for style, layout and paint. */}
        <div className="h-full" style={{ contentVisibility: overview ? "hidden" : "visible" }}>
          {children(tier)}
        </div>
        {overview && (
          <OverviewCard title={title} from={statusFrom} icon={Icon} />
        )}
      </div>
    </div>
  );
}

/** The far-zoom face of a tile: counter-scaled so it reads at any zoom. */
/** The live dot pulses only where you can read the tile — 100 infinite
 * animations inside the transformed world repaint the board every frame. */
function StatusDot({ from, animate }: { from: StatusFrom; animate: boolean }) {
  const { status } = useTileStatus(from, useSpatialStore().isInteracting);
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        STATUS_DOT[status],
        animate && status === "streaming" && "animate-pulse",
      )}
      title={STATUS_LABEL[status]}
    />
  );
}

function OverviewCard({
  title,
  from,
  icon: Icon,
}: {
  title: string;
  from: StatusFrom;
  icon?: LucideIcon;
}) {
  const { status, progress } = useTileStatus(from, useSpatialStore().isInteracting);
  return (
    <div className="absolute inset-0 flex flex-col justify-between bg-card p-4">
      <div className="flex items-start gap-2">
        {Icon && (
          <Icon
            className="shrink-0 text-muted-foreground"
            style={{ width: "calc(16px / var(--spatial-z))", height: "calc(16px / var(--spatial-z))" }}
          />
        )}
        <p
          className="line-clamp-3 font-semibold leading-tight text-foreground"
          style={{ fontSize: "min(calc(15px / var(--spatial-z)), 72px)" }}
        >
          {title}
        </p>
      </div>
      <div className="space-y-2">
        <p
          className="font-medium text-muted-foreground"
          style={{ fontSize: "min(calc(11px / var(--spatial-z)), 48px)" }}
        >
          {/* One string, one text node: a conditional second node is an
              insertion, and insertions are what the shell's :has() rules
              turn into whole-tree restyles. */}
          {`${STATUS_LABEL[status]}${progress !== null && status === "streaming" ? ` · ${Math.round(progress * 100)}%` : ""}`}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          {/* Steps, not a transition: at this zoom a 5% step needs no easing,
              and 100 bars easing at once invalidate the moving world layer
              every frame. scaleX, never width (width re-runs layout). */}
          <div
            className={cn(
              "h-full w-full origin-left rounded-full",
              status === "error" ? "bg-destructive" : "bg-primary",
            )}
            style={{ transform: `scaleX(${status === "complete" ? 1 : (progress ?? 0)})` }}
          />
        </div>
      </div>
    </div>
  );
}
