"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ScrollFade — a reusable "there's more content this way" affordance.
 *
 * Applies a `mask-image` gradient that fades the content at whichever scroll
 * edge still has hidden content. At the top of the scroll the top edge is crisp;
 * once you scroll down, the top fades and (if more remains) the bottom fades too.
 * Without it, a clipped scroll area reads as "what you see is all there is" — the
 * fade tells the user to keep scrolling.
 *
 * Two ways to use it:
 *  1. `<ScrollFade className="flex-1">…</ScrollFade>` — owns the scroll container.
 *  2. `const { ref, style } = useScrollFade(); <div ref={ref} style={style} className="overflow-y-auto">`
 *     — attach the fade to a scroll element you already render.
 *
 * The fade is dynamic (driven by scroll position + content/size changes), so an
 * area that isn't overflowing shows no fade at all.
 */

type Orientation = "vertical" | "horizontal";

interface Edges {
  start: boolean;
  end: boolean;
}

const EDGE_EPSILON = 1; // sub-pixel rounding guard

function readEdges(el: HTMLElement, orientation: Orientation): Edges {
  if (orientation === "horizontal") {
    return {
      start: el.scrollLeft > EDGE_EPSILON,
      end:
        el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_EPSILON,
    };
  }
  return {
    start: el.scrollTop > EDGE_EPSILON,
    end: el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_EPSILON,
  };
}

function buildMask(
  edges: Edges,
  orientation: Orientation,
  fade: number,
): string | undefined {
  // Fully crisp both ends → no mask (avoids a needless compositing layer).
  if (!edges.start && !edges.end) return undefined;
  const dir = orientation === "horizontal" ? "to right" : "to bottom";
  const stops: string[] = [];
  stops.push(edges.start ? "transparent 0" : "#000 0");
  if (edges.start) stops.push(`#000 ${fade}px`);
  if (edges.end) stops.push(`#000 calc(100% - ${fade}px)`);
  stops.push(edges.end ? "transparent 100%" : "#000 100%");
  return `linear-gradient(${dir}, ${stops.join(", ")})`;
}

/**
 * Attach a dynamic scroll-edge fade to an element you render yourself.
 * Spread the returned `style` onto the scroll container and set its `ref`.
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  orientation: Orientation = "vertical",
  fade = 28,
) {
  const ref = React.useRef<T>(null);
  const [edges, setEdges] = React.useState<Edges>({ start: false, end: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = readEdges(el, orientation);
      setEdges((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      );
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    // Content or viewport size changes can flip whether an edge overflows.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [orientation]);

  const mask = buildMask(edges, orientation, fade);
  const style: React.CSSProperties = mask
    ? { maskImage: mask, WebkitMaskImage: mask }
    : {};

  return { ref, style, edges };
}

export interface ScrollFadeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: Orientation;
  /** Fade depth in px at each active edge. */
  fade?: number;
}

/** A scroll container that fades its content at overflowing edges. */
export const ScrollFade = React.forwardRef<HTMLDivElement, ScrollFadeProps>(
  ({ orientation = "vertical", fade = 28, className, style, children, ...props }, forwardedRef) => {
    const { ref, style: maskStyle } = useScrollFade<HTMLDivElement>(
      orientation,
      fade,
    );

    // Merge the internal scroll ref with an optional forwarded ref.
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef)
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
      },
      [ref, forwardedRef],
    );

    return (
      <div
        ref={setRefs}
        className={cn(
          orientation === "horizontal"
            ? "overflow-x-auto"
            : "overflow-y-auto",
          "overscroll-contain",
          className,
        )}
        style={{ ...maskStyle, ...style }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
ScrollFade.displayName = "ScrollFade";
