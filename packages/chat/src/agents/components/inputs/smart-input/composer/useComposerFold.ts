"use client";

import { useEffect, useState } from "react";

/**
 * Below this many px of COMPOSER width (never the screen's — a chat beside the
 * canvas resizes from 340 to 768), Scope and Output fold into the + menu and
 * the meta row keeps surface values · agent · effort.
 */
export const COMPOSER_FOLD_WIDTH_PX = 480;

/**
 * Watches the composer's own width — and whether a row under the card
 * overflows — and re-renders only when the fold flips, never per pixel while
 * a panel is dragged.
 */
export function useComposerFold() {
  // A callback ref: the composer root mounts after the uninitialized shell.
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    // No ResizeObserver (a test DOM): the composer stays unfolded.
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    // Fold when the composer is narrow OR a row under the card overflows (a
    // long agent name, more pills); unfold only once there is clear room
    // again — the width that forced the fold plus a margin — so it never
    // flips back and forth at the edge.
    let foldedAt = 0;
    const evaluate = () => {
      const width = el.getBoundingClientRect().width;
      if (width === 0) return;
      const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-composer-row]"));
      const overflowing = rows.some((row) => row.scrollWidth > row.clientWidth + 1);
      setFolded((was) => {
        if (width < COMPOSER_FOLD_WIDTH_PX) {
          foldedAt = Math.max(foldedAt, width);
          return true;
        }
        if (!was && overflowing) {
          foldedAt = width;
          return true;
        }
        if (was && width > foldedAt + UNFOLD_MARGIN_PX && !overflowing) {
          foldedAt = 0;
          return false;
        }
        return was;
      });
    };
    const observer = new ResizeObserver(evaluate);
    observer.observe(el);
    // A row whose content grows (an agent switch) re-checks too.
    const mutations = new MutationObserver(() => requestAnimationFrame(evaluate));
    mutations.observe(el, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [el]);
  return { ref, folded };
}

/** Clear room needed past the width that forced a fold before unfolding. */
const UNFOLD_MARGIN_PX = 80;
