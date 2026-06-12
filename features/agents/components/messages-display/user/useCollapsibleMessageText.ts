import { useLayoutEffect, useRef, useState } from "react";

/** Matches Tailwind `max-h-12` (3rem ≈ 48px at default root). */
const COLLAPSE_THRESHOLD_PX = 48;

/**
 * Collapse state for user-message text bodies.
 *
 * Uses an off-screen sizer (via `measureRef`) that is never clamped, so
 * re-measurement stays accurate even while the visible copy is collapsed.
 * ResizeObserver catches font load + container width reflow.
 */
export function useCollapsibleMessageText(text: string) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [shouldBeCollapsible, setShouldBeCollapsible] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const previousContentRef = useRef("");

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;

    const measure = () => {
      const contentHeight = node.scrollHeight;
      const isLong = contentHeight > COLLAPSE_THRESHOLD_PX;
      const contentChanged = previousContentRef.current !== text;

      setShouldBeCollapsible(isLong);

      if (contentChanged) {
        setIsCollapsed(isLong);
        previousContentRef.current = text;
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return {
    isCollapsed,
    setIsCollapsed,
    shouldBeCollapsible,
    measureRef,
  };
}
