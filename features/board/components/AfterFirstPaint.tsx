"use client";

/**
 * A tile appears at once; its feature body (the real chat column, the real note editor, a whole
 * table) mounts right after the tile's first paint. The body's heavy first render used to sit
 * inside the click that added it (57-107 ms long tasks), so the tile showed up late and the
 * click felt stuck. Now: the tile frame and a quiet skeleton shaped like the type paint first,
 * then the body mounts as a transition — React slices that work, so input and the next frame are
 * never held behind it. No spinner: a skeleton is the placeholder's whole job.
 *
 * This is scheduling, not splitting: the body is still part of the board's one lazy edge (no
 * `dynamic()` per tile — the code-splitting FRAGMENTATION LAW).
 */

import { startTransition, useEffect, useState, type ReactNode } from "react";

/** Which skeleton fits: a grid for data, bubbles for conversations, lines for everything else. */
export type SkeletonShape = "lines" | "grid" | "chat";

const GRID_TYPES = new Set(["table", "record", "pick list", "flashcard deck", "study kit"]);
const CHAT_TYPES = new Set(["chat", "agent form", "meeting notes"]);

export function skeletonShapeFor(typeLabel: string): SkeletonShape {
  const t = typeLabel.trim().toLowerCase();
  return GRID_TYPES.has(t) ? "grid" : CHAT_TYPES.has(t) ? "chat" : "lines";
}

export function TileSkeleton({ typeLabel }: { typeLabel: string }) {
  const shape = skeletonShapeFor(typeLabel);
  const bar = "rounded bg-muted/70";
  return (
    <div data-tile-skeleton={shape} aria-hidden className="flex h-full flex-col gap-2 bg-card px-4 py-3">
      {shape === "grid" ? (
        <>
          <div className={`${bar} h-5 w-full`} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-2">
              <div className={`${bar} h-3.5 w-1/4`} />
              <div className={`${bar} h-3.5 w-1/3`} />
              <div className={`${bar} h-3.5 flex-1`} />
            </div>
          ))}
        </>
      ) : shape === "chat" ? (
        <>
          <div className={`${bar} h-9 w-2/3 self-end`} />
          <div className={`${bar} h-14 w-4/5`} />
          <div className={`${bar} h-9 w-1/2 self-end`} />
          <div className={`${bar} mt-auto h-9 w-full`} />
        </>
      ) : (
        <>
          <div className={`${bar} h-4 w-2/3`} />
          <div className={`${bar} h-3 w-full`} />
          <div className={`${bar} h-3 w-5/6`} />
          <div className={`${bar} h-3 w-1/2`} />
        </>
      )}
    </div>
  );
}

export function AfterFirstPaint({ placeholder, children }: { placeholder: ReactNode; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  // A passive effect runs after the browser has had the chance to paint the commit; the state
  // change is a transition, so the (large) body render yields to input instead of being one task.
  useEffect(() => {
    startTransition(() => setReady(true));
  }, []);
  return <>{ready ? children : placeholder}</>;
}
