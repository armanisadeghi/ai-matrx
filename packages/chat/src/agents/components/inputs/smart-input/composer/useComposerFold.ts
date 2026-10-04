"use client";

import { useEffect, useState } from "react";

/**
 * Below this many px of COMPOSER width (never the screen's — a chat beside the
 * canvas resizes from 340 to 768), Scope and Output fold into the + menu and
 * the meta row keeps surface values · agent · effort.
 */
export const COMPOSER_FOLD_WIDTH_PX = 480;

/**
 * Watches the composer's own width and re-renders only when it crosses the
 * fold threshold — never per pixel while a panel is dragged.
 */
export function useComposerFold() {
  // A callback ref: the composer root mounts after the uninitialized shell.
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setFolded(width > 0 && width < COMPOSER_FOLD_WIDTH_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref, folded };
}
