"use client";

/**
 * Opener for the `kgSuggestionsDrawer` overlay — the global Knowledge-Graph
 * suggestion inbox (every pending KG → scope-item suggestion across the user's
 * data, grouped by source + a heavy-hitter "suggest a scope" section).
 *
 * - `useOpenKgSuggestionsDrawer()` — imperative hook; returns a handle with
 *   `close()`.
 * - `<KgSuggestionsDrawerController />` — declarative wrapper; mount to open,
 *   unmount to close.
 *
 * The drawer takes no input data — it always lists the caller's pending
 * suggestions. Follow the quickNotes opener as the template.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "kgSuggestionsDrawer" as const;

export interface KgSuggestionsDrawerHandle {
  close: () => void;
}

export function useOpenKgSuggestionsDrawer() {
  const dispatch = useAppDispatch();
  return useCallback((): KgSuggestionsDrawerHandle => {
    dispatch(openOverlay({ overlayId: OVERLAY_ID, data: {} }));
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  }, [dispatch]);
}

/**
 * Declarative form. Renders nothing visible; opens on mount, closes on
 * unmount.
 */
export function KgSuggestionsDrawerController(): null {
  const open = useOpenKgSuggestionsDrawer();
  useEffect(() => {
    const handle = open();
    return () => handle.close();
  }, [open]);
  return null;
}
