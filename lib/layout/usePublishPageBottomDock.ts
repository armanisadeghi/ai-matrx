"use client";

// lib/layout/usePublishPageBottomDock.ts — a page's own bottom bar or drawer tells the floating
// chrome how tall it is. Floating chrome that honours `--page-bottom-dock-h` (the assists
// launcher, the admin error badge) then rests ABOVE the bar instead of over its last control.
// A fixed bottom drawer that never published this was covered by both (e-sign signer, a phone
// "Accept terms" checkbox, 2026-10-07).

import { useEffect, type RefObject } from "react";

export const PAGE_BOTTOM_DOCK_VAR = "--page-bottom-dock-h";

/** Publish the element's height (+8px breathing gap) while it is mounted; clear it on unmount. */
export function usePublishPageBottomDock(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(PAGE_BOTTOM_DOCK_VAR, `${Math.round(el.getBoundingClientRect().height) + 8}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(PAGE_BOTTOM_DOCK_VAR);
    };
  }, [ref, active]);
}
