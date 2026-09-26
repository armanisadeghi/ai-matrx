"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeftTapButton,
  ChevronRightTapButton,
} from "@ai-matrx/tap-target/buttons";
import { cn } from "@/lib/utils";

const EDGE_TOLERANCE_PX = 2;

interface MarkdownTableScrollAreaProps {
  children: ReactNode;
  className?: string;
}

/**
 * The one horizontal viewport for Markdown tables. Native touch/trackpad
 * scrolling remains available; the buttons make wide tables discoverable and
 * operable for mouse and keyboard users without creating a vertical scroller.
 */
export function MarkdownTableScrollArea({
  children,
  className,
}: MarkdownTableScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateEdges = () => {
      const maxScrollLeft = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );
      setCanScrollLeft(viewport.scrollLeft > EDGE_TOLERANCE_PX);
      setCanScrollRight(
        viewport.scrollLeft < maxScrollLeft - EDGE_TOLERANCE_PX,
      );
    };

    // No synchronous first read: the ResizeObserver below reports once as soon
    // as it observes, after layout. Reading scrollWidth here forced a layout of
    // the whole document per table mounting (the markdown-tester crash,
    // 2026-09-26: ~3 s on a 1 MB document).
    viewport.addEventListener("scroll", updateEdges, { passive: true });

    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", updateEdges);
      resizeObserver.disconnect();
    };
  }, []);

  const scroll = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(240, viewport.clientWidth * 0.75),
      behavior: "smooth",
    });
  };

  const hasOverflow = canScrollLeft || canScrollRight;

  return (
    <div className="relative min-w-0" data-markdown-table-scroll-area>
      <div
        ref={viewportRef}
        className={cn("overflow-x-auto overscroll-x-contain", className)}
        tabIndex={hasOverflow ? 0 : undefined}
        aria-label={hasOverflow ? "Scrollable table" : undefined}
      >
        {children}
      </div>
      {hasOverflow ? (
        <div
          className="flex justify-end"
          aria-label="Table horizontal scroll controls"
        >
          <ChevronLeftTapButton
            variant="transparent"
            ariaLabel="Scroll table left"
            disabled={!canScrollLeft}
            onClick={() => scroll(-1)}
          />
          <ChevronRightTapButton
            variant="transparent"
            ariaLabel="Scroll table right"
            disabled={!canScrollRight}
            onClick={() => scroll(1)}
          />
        </div>
      ) : null}
    </div>
  );
}
