"use client";

/**
 * TileFace — how a tile reads when its content cannot be read.
 *
 * `OverviewCard`: the far-zoom face (overview tier). A designed card per item
 * type — the type's colour, its icon and name, the title in a weight that
 * reads at any zoom, and the item's status — instead of a shrunken copy. Sizes
 * live in `board-accents.css` (screen-sized, capped by the card's own box).
 *
 * `StatusChip`: the item's real state (`BoardItemType.status`) — a tone dot
 * and one or two words, in the header at read/glance and on the card at
 * overview. Tones are semantic tokens, so both themes hold.
 */

import "./board-accents.css";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardAccent, ItemStatus, ItemStatusTone } from "../items/types";
import { useBoardCameraStore } from "../engine/react";
import { type StatusFrom, type TileStatus, useTileStatus } from "../streams/useSourceStatus";

const TONE_INK: Record<ItemStatusTone, string> = {
  neutral: "text-muted-foreground/70",
  active: "text-primary",
  attention: "text-warning",
  success: "text-success",
  danger: "text-destructive",
};

/** A stream tile's phase in the same words and tones as an item's status. */
const STREAM_STATUS: Record<TileStatus, ItemStatus | null> = {
  idle: null,
  queued: { tone: "neutral", label: "Queued" },
  streaming: { tone: "active", label: "Live" },
  complete: { tone: "success", label: "Done" },
  error: { tone: "danger", label: "Failed" },
};

export function accentStyle(accent: BoardAccent): CSSProperties {
  return { ["--tile-accent" as string]: `var(--board-accent-${accent})` };
}

/** One status, drawn the same way everywhere: a tone dot and its words. */
export function StatusChip({
  status,
  variant,
  animate = false,
}: {
  status: ItemStatus;
  /** `header`: a quiet pill in the tile's header. `face`: the card's foot (sized by the card). */
  variant: "header" | "face";
  /** Pulse an active dot — only where the tile is readable (far-zoom pulses repaint the board). */
  animate?: boolean;
}) {
  return (
    <span
      data-board-status={status.tone}
      title={status.label}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center",
        variant === "header"
          ? "h-5 shrink-0 gap-1.5 rounded-full bg-muted px-2 type-meta font-medium text-muted-foreground"
          : "gap-[0.45em] font-medium text-muted-foreground",
        status.tone === "danger" && "text-destructive",
      )}
    >
      {/* The dot is drawn ink (an svg), so the pill guard measures it as content. */}
      <svg
        viewBox="0 0 8 8"
        aria-hidden
        className={cn(
          "shrink-0",
          variant === "header" ? "h-1.5 w-1.5" : "h-[0.6em] w-[0.6em]",
          TONE_INK[status.tone],
          animate && status.tone === "active" && "animate-pulse",
        )}
      >
        <circle cx="4" cy="4" r="4" fill="currentColor" />
      </svg>
      <span className="truncate">{status.label}</span>
    </span>
  );
}

/**
 * The far-zoom face of a tile. `status` is the item's own state (rendered by
 * the host, which knows the item type); a stream tile (`from` not static)
 * shows its phase and progress bar instead.
 */
export function OverviewCard({
  title,
  typeLabel,
  icon: Icon,
  accent,
  selected = false,
  from,
  status,
  media,
}: {
  /** A picture for the card (`BoardItemType.Face`), drawn in the space between the title and the status. */
  media?: React.ReactNode;
  title: string;
  typeLabel?: string;
  icon?: LucideIcon;
  accent: BoardAccent;
  /** Drawn as a screen-sized ring: the tile's own 2px ring vanishes at this zoom. */
  selected?: boolean;
  from: StatusFrom;
  status?: React.ReactNode;
}) {
  return (
    <div
      data-board-overview
      data-selected={selected || undefined}
      className="board-face absolute inset-0 z-[1] flex flex-col overflow-hidden"
      style={accentStyle(accent)}
    >
      <div className="board-face-band shrink-0" />
      <div className="board-face-body flex min-h-0 flex-1 flex-col">
        {(Icon || typeLabel) && (
          <div className="board-face-kind flex min-w-0 items-center font-semibold uppercase tracking-[0.06em]">
            {Icon && <Icon aria-hidden />}
            {typeLabel && <span className="truncate">{typeLabel}</span>}
          </div>
        )}
        <p className="board-face-title line-clamp-2 break-words font-semibold leading-[1.18] tracking-[-0.01em] text-foreground">
          {title}
        </p>
        {media ? <div className="board-face-media relative min-h-0 flex-1 overflow-hidden">{media}</div> : null}
        <div className="board-face-foot mt-auto flex min-w-0 items-center">
          {from.kind === "static" ? status : <StreamFoot from={from} />}
        </div>
      </div>
    </div>
  );
}

/** A stream's phase + progress, read in this leaf only (never the tile body). */
function StreamFoot({ from }: { from: StatusFrom }) {
  const { status, progress } = useTileStatus(from, useBoardCameraStore().isInteracting);
  const chip = STREAM_STATUS[status];
  return (
    <div className="flex w-full min-w-0 flex-col gap-[0.4em]">
      {chip && (
        <StatusChip
          variant="face"
          status={{
            ...chip,
            // One string, one text node (the shell's :has() rules turn node
            // insertions into whole-tree restyles).
            label: `${chip.label}${progress !== null && status === "streaming" ? ` · ${Math.round(progress * 100)}%` : ""}`,
          }}
        />
      )}
      <div className="board-face-bar w-full overflow-hidden rounded-full bg-muted">
        {/* Steps, not a transition, and scaleX, never width: 100 bars easing
            at once invalidate the moving world layer every frame. */}
        <div
          className={cn("h-full w-full origin-left rounded-full", status === "error" ? "bg-destructive" : "bg-primary")}
          style={{ transform: `scaleX(${status === "complete" ? 1 : (progress ?? 0)})` }}
        />
      </div>
    </div>
  );
}
