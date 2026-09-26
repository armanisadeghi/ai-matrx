// components/mardown-display/chat-markdown/progressive-mount.tsx
//
// A HUGE DOCUMENT NEVER MOUNTS ALL AT ONCE — AND NEVER MOUNTS WHAT NOBODY
// SCROLLED TO. Rendering thousands of blocks in one commit (a 1 MB paste is
// ~1,600 blocks, a 5 MB one ~8,000) held the main thread for tens of seconds,
// and a fully mounted 5 MB document still grew past 2 GB of heap — which is
// what a browser shows as a crashed tab (the markdown-tester crash, Arman
// 2026-09-26).
//
//   - Up to FIRST_SLICE blocks mount at once: every ordinary message and
//     document is far below that and renders exactly as before.
//   - Up to AUTO_LIMIT, the rest mounts SLICE blocks per low-priority
//     transition, so the page stays responsive while the tail fills in.
//   - Past AUTO_LIMIT, the next slice mounts only when the reader scrolls near
//     the end of what is mounted. The sentinel SAYS so ("Showing 600 of 8,269
//     blocks") — nothing is silently missing.
// An edit never unmounts mounted blocks; a cleared document (or one replaced
// by a small one) starts over.

"use client";

import { nearestScrollRoot } from "@/lib/layout/scroll-root";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";

/** Blocks mounted in the first commit — above any real chat answer. */
export const PROGRESSIVE_FIRST_SLICE = 200;
/** Blocks added per follow-up slice. */
export const PROGRESSIVE_SLICE = 150;
/** Blocks mounted without the reader scrolling; the rest follow the scroll. */
export const PROGRESSIVE_AUTO_LIMIT = 600;

/** Next count after one slice; pure so it is testable. */
export function nextProgressiveCount(current: number, total: number): number {
  return Math.min(total, current + PROGRESSIVE_SLICE);
}

export interface ProgressiveMount {
  /** How many blocks to render now. */
  shown: number;
  /** Render after the mounted blocks: null once everything is mounted. */
  sentinel: ReactNode;
}

export function useProgressiveMount(total: number): ProgressiveMount {
  const [mounted, setMounted] = useState(() => Math.min(total, PROGRESSIVE_FIRST_SLICE));
  // Derived-state update: the document was cleared or replaced by a small
  // one, so the next large one slices again. (Not on every shrink: a block
  // merging while someone types must not unmount the tail for a frame.)
  if (total <= PROGRESSIVE_FIRST_SLICE && mounted > PROGRESSIVE_FIRST_SLICE) {
    setMounted(PROGRESSIVE_FIRST_SLICE);
  }
  const shown = Math.max(Math.min(total, PROGRESSIVE_FIRST_SLICE), Math.min(mounted, total));
  const auto = shown < Math.min(total, PROGRESSIVE_AUTO_LIMIT);

  useEffect(() => {
    if (!auto) return undefined;
    // A macrotask, not a microtask: the browser paints and handles input
    // between slices.
    const timer = setTimeout(() => {
      startTransition(() =>
        setMounted((m) =>
          Math.min(PROGRESSIVE_AUTO_LIMIT, nextProgressiveCount(Math.max(m, shown), total)),
        ),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [auto, shown, total]);

  const more = () =>
    startTransition(() => setMounted((m) => nextProgressiveCount(Math.max(m, shown), total)));

  const sentinel =
    shown >= total ? null : (
      <ScrollSentinel key={shown} active={!auto} onVisible={more} shown={shown} total={total} />
    );
  return { shown, sentinel };
}

/** Back-compat shape for callers that only need the count. */
export function useProgressiveCount(total: number): number {
  return useProgressiveMount(total).shown;
}

function ScrollSentinel({
  active,
  onVisible,
  shown,
  total,
}: {
  active: boolean;
  onVisible: () => void;
  shown: number;
  total: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVisible();
      },
      // Its own scroller, so the margin holds inside a panel or drawer too.
      { root: nearestScrollRoot(el), rootMargin: "1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active, onVisible]);
  return (
    <div
      ref={ref}
      data-progressive-sentinel=""
      role="status"
      className="py-3 text-center text-xs text-muted-foreground"
    >
      {active ? (
        <button type="button" onClick={onVisible} className="underline-offset-2 hover:underline">
          Showing {shown.toLocaleString()} of {total.toLocaleString()} blocks — more load as you scroll (or click)
        </button>
      ) : (
        <>Loading {shown.toLocaleString()} of {total.toLocaleString()} blocks…</>
      )}
    </div>
  );
}
