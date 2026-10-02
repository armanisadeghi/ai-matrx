import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Matches Tailwind `max-h-12` (3rem ≈ 48px at default root). */
const COLLAPSE_THRESHOLD_PX = 48;

/**
 * Collapse state for user-message bubbles.
 *
 * IMPORTANT — this measures the ENTIRE user-message body, not just its text.
 * Whatever the caller wraps in `measureRef` (variables strip, context chips,
 * attachment chips, AND the text) counts toward the height that decides
 * collapsibility, and the same region is the one the caller clamps. The "top
 * section" (variables) is frequently the largest block of text in the bubble,
 * so it MUST be inside the measured/clamped region. Do not regress this back to
 * a text-only measurement.
 *
 * Uses an off-screen sizer (via `measureRef`) that is never clamped, so
 * re-measurement stays accurate even while the visible copy is collapsed.
 * ResizeObserver catches font load, async chip/variable hydration, and
 * container width reflow.
 *
 * `contentKey` is an opaque signature of everything inside the bubble (text +
 * a fingerprint of the non-text sections). When it changes we treat the bubble
 * as new content and re-evaluate collapse from scratch.
 *
 * Bubbles ALWAYS default to collapsed when they exceed the threshold — on both
 * the live-submit and DB-reload paths — and only ever open when the user
 * physically clicks expand. A late remeasure re-collapses unless the user has
 * explicitly toggled.
 */
export function useCollapsibleMessageText(contentKey: string) {
  const [isCollapsed, setIsCollapsedState] = useState(true);
  const [shouldBeCollapsible, setShouldBeCollapsible] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const previousContentRef = useRef("");
  /** True after the user clicks expand/collapse — blocks auto re-collapse. */
  const userToggledRef = useRef(false);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return undefined;

    const measure = () => {
      const contentHeight = node.scrollHeight;
      const isLong = contentHeight > COLLAPSE_THRESHOLD_PX;
      const contentChanged = previousContentRef.current !== contentKey;

      setShouldBeCollapsible(isLong);

      if (contentChanged) {
        previousContentRef.current = contentKey;
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

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [contentKey]);

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
