// components/mardown-display/chat-markdown/progressive-mount.ts
//
// A HUGE DOCUMENT MOUNTS IN SLICES. Rendering thousands of blocks in one
// commit (a 1 MB paste is ~1,600 blocks, a 5 MB one ~8,000) held the main
// thread for tens of seconds and the browser reported the tab as crashed
// (the markdown-tester crash, Arman 2026-09-26). Up to FIRST_SLICE blocks
// mount at once — every ordinary message and document is far below that and
// renders exactly as before. Past it, the rest mounts SLICE blocks per
// low-priority transition, so the page stays responsive while the tail fills
// in. An edit never unmounts mounted blocks; a cleared document (or one
// replaced by a small one) starts slicing again, and a stream
// that appends blocks shows each one as soon as the previous slice finished.

"use client";

import { startTransition, useEffect, useState } from "react";

/** Blocks mounted in the first commit — above any real chat answer. */
export const PROGRESSIVE_FIRST_SLICE = 200;
/** Blocks added per follow-up slice. */
export const PROGRESSIVE_SLICE = 150;

/** Next count after one slice; pure so it is testable. */
export function nextProgressiveCount(current: number, total: number): number {
  return Math.min(total, current + PROGRESSIVE_SLICE);
}

export function useProgressiveCount(total: number): number {
  const [mounted, setMounted] = useState(() => Math.min(total, PROGRESSIVE_FIRST_SLICE));
  // Derived-state update: the document was cleared or replaced by a small
  // one, so the next large one slices again. (Not on every shrink: a block
  // merging while someone types must not unmount the tail for a frame.)
  if (total <= PROGRESSIVE_FIRST_SLICE && mounted > PROGRESSIVE_FIRST_SLICE) {
    setMounted(PROGRESSIVE_FIRST_SLICE);
  }
  const shown = Math.max(Math.min(total, PROGRESSIVE_FIRST_SLICE), Math.min(mounted, total));

  useEffect(() => {
    if (shown >= total) return undefined;
    // A macrotask, not a microtask: the browser paints and handles input
    // between slices.
    const timer = setTimeout(() => {
      startTransition(() => setMounted((m) => nextProgressiveCount(Math.max(m, shown), total)));
    }, 0);
    return () => clearTimeout(timer);
  }, [shown, total]);

  return shown;
}
