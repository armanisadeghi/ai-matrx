"use client";

/**
 * BoardFrameView — a titled region of the plane that groups related tiles (one
 * workflow run, one topic, one meeting). Frames are how a large board keeps
 * its sense of place: the label is counter-scaled at far zoom so the board
 * reads as a map of named regions, and clicking the label flies there and
 * selects the frame: Delete / Backspace (the board's keys) or the label's
 * trash button then removes the frame — its tiles stay — as one undoable step.
 */

import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rect } from "../engine/camera";
import { useBoardCameraStore, useIsSelected } from "../engine/react";

/** World px above a frame kept in view with it (its label at fit zoom). */
const TITLE_BAND = 110;

interface BoardFrameViewProps {
  id: string;
  rect: Rect;
  title: string;
  /** One-line note beside the title — what this region is for. */
  note?: string;
  /** Removes the frame (never its tiles); absent = the host keeps its frames. */
  onRemove?: (id: string) => void;
}

export function BoardFrameView({
  id,
  rect,
  title,
  note,
  onRemove,
}: BoardFrameViewProps) {
  const store = useBoardCameraStore();
  const frameId = `frame:${id}`;
  const selected = useIsSelected(id);

  // The label sits ABOVE the rect, so the flown-to area includes its band —
  // flying to a frame shows its name, not just its contents.
  useEffect(
    () =>
      store.registerItem(frameId, {
        ...rect,
        y: rect.y - TITLE_BAND,
        h: rect.h + TITLE_BAND,
      }),
    [store, frameId, rect],
  );

  return (
    <div
      data-board-frame={id}
      className={cn(
        "pointer-events-none absolute max-w-none rounded-2xl border border-dashed bg-background/40",
        selected ? "border-primary" : "border-border/80",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div className="pointer-events-auto absolute bottom-full left-0 flex max-w-none items-center gap-2 pb-3">
        <button
          type="button"
          onClick={() => {
            if (onRemove) store.select(id);
            store.fitItem(frameId);
          }}
          className="flex max-w-none items-baseline gap-3 text-left"
          title={`Fly to ${title}`}
        >
          <span
            className="whitespace-nowrap font-semibold tracking-tight text-foreground"
            style={{
              fontSize: "max(26px, min(calc(13px / var(--board-z)), 160px))",
            }}
          >
            {title}
          </span>
          {note && (
            <span
              className="truncate text-muted-foreground"
              style={{
                fontSize: "max(15px, min(calc(9px / var(--board-z)), 90px))",
              }}
            >
              {note}
            </span>
          )}
        </button>
        {onRemove && selected && (
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label={`Delete frame ${title}`}
            title="Delete frame (its tiles stay)"
            className="flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-destructive"
            style={{
              width: "max(32px, calc(14px / var(--board-z)))",
              height: "max(32px, calc(14px / var(--board-z)))",
            }}
          >
            <Trash2 style={{ width: "50%", height: "50%" }} />
          </button>
        )}
      </div>
    </div>
  );
}
