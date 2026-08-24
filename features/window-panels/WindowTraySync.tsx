"use client";

/**
 * WindowTraySync
 *
 * Mounts ONCE in the root layout. Attaches a single debounced resize listener
 * that:
 *  1. Recomputes the positions of all minimized windows (tray slots can change
 *     when chips-per-row shifts on viewport resize).
 *  2. Clamps every docked windowed window into the new viewport so windows
 *     positioned for a larger screen stay reachable after a downsize.
 *
 * Zero re-renders — fires and forgets.
 *
 * Debounce: 500ms — a continuous window-drag generates exactly one dispatch
 * when the user stops moving. Short bursts (e.g. snapping) are ignored.
 *
 * Usage (in both authenticated and SSR root layouts):
 *   <WindowTraySync />
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  recomputeTrayPositions,
  clampAllWindowRects,
} from "@/lib/redux/slices/windowManagerSlice";
import { safeViewportDims } from "./utils/rectClamp";

const DEBOUNCE_MS = 500;

export function WindowTraySync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        // A resize that measures 0×0 is a hidden/undisplayed tab or a
        // display:none ancestor, never a real screen. Bail WITHOUT dispatching:
        // reacting to it would rewrite every window rect and every tray slot
        // against invented dimensions, and the next real measurement would
        // then have to undo it. No measurement, no write.
        const { vw, vh, degenerate } = safeViewportDims();
        if (degenerate) return;
        dispatch(
          recomputeTrayPositions({ viewportWidth: vw, viewportHeight: vh }),
        );
        dispatch(clampAllWindowRects({ viewportWidth: vw, viewportHeight: vh }));
      }, DEBOUNCE_MS);
    };

    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      if (timer !== null) clearTimeout(timer);
    };
  }, [dispatch]);

  return null;
}

export default WindowTraySync;
