"use client";

/**
 * SpatialFrame — a titled region of the plane that groups related tiles (one
 * workflow run, one topic, one meeting). Frames are how a large board keeps
 * its spatial memory: the label is counter-scaled at far zoom so the board
 * reads as a map of named regions, and clicking the label flies there.
 */

import { useEffect } from "react";
import type { Rect } from "../engine/camera";
import { useSpatialStore } from "../engine/react";

interface SpatialFrameProps {
  id: string;
  rect: Rect;
  title: string;
  /** One-line note beside the title — what this region is for. */
  note?: string;
}

export function SpatialFrame({ id, rect, title, note }: SpatialFrameProps) {
  const store = useSpatialStore();
  const frameId = `frame:${id}`;

  useEffect(() => store.registerItem(frameId, rect), [store, frameId, rect]);

  return (
    <div
      className="pointer-events-none absolute rounded-2xl border border-dashed border-border/80 bg-background/40"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <button
        type="button"
        onClick={() => store.fitItem(frameId)}
        className="pointer-events-auto absolute bottom-full left-0 flex max-w-full items-baseline gap-3 pb-3 text-left"
        title={`Fly to ${title}`}
      >
        <span
          className="whitespace-nowrap font-semibold tracking-tight text-foreground"
          style={{ fontSize: "max(26px, min(calc(13px / var(--spatial-z)), 160px))" }}
        >
          {title}
        </span>
        {note && (
          <span
            className="truncate text-muted-foreground"
            style={{ fontSize: "max(15px, min(calc(9px / var(--spatial-z)), 90px))" }}
          >
            {note}
          </span>
        )}
      </button>
    </div>
  );
}
