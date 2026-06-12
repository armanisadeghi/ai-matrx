import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Matches Tailwind `max-h-12` (3rem ≈ 48px at default root). */
const COLLAPSE_THRESHOLD_PX = 48;

/**
 * Collapse state for user-message text bodies.
 *
 * Uses an off-screen sizer (via `measureRef`) that is never clamped, so
 * re-measurement stays accurate even while the visible copy is collapsed.
 * ResizeObserver catches font load + container width reflow.
 *
 * Long messages default collapsed. A late remeasure that discovers length
 * re-collapses unless the user has explicitly expanded.
 */
export function useCollapsibleMessageText(text: string) {
  const [isCollapsed, setIsCollapsedState] = useState(true);
  const [shouldBeCollapsible, setShouldBeCollapsible] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const previousContentRef = useRef("");
  /** True after the user clicks expand/collapse — blocks auto re-collapse. */
  const userToggledRef = useRef(false);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;

    const measure = () => {
      const contentHeight = node.scrollHeight;
      const isLong = contentHeight > COLLAPSE_THRESHOLD_PX;
      const contentChanged = previousContentRef.current !== text;

      setShouldBeCollapsible(isLong);

      if (contentChanged) {
        previousContentRef.current = text;
        userToggledRef.current = false;
        setIsCollapsedState(isLong);
        return;
      }

      if (!isLong) {
        setIsCollapsedState(false);
      } else if (!userToggledRef.current) {
        setIsCollapsedState(true);
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  const setIsCollapsed = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      userToggledRef.current = true;
      setIsCollapsedState(value);
    },
    [],
  );

  return {
    isCollapsed,
    setIsCollapsed,
    shouldBeCollapsible,
    measureRef,
  };
}
