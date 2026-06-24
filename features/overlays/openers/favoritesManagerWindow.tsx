"use client";

/**
 * Opener for the `favoritesManagerWindow` overlay — the "Manage favorites"
 * window (check app areas to pin / unpin, remove other pins).
 *
 * - `useOpenFavoritesManagerWindow()` — imperative hook; returns a handle with
 *   `close()`.
 * - `<FavoritesManagerWindowController />` — declarative mount-to-open wrapper.
 *
 * No-prop opener (the panel reads everything from preferences/Redux). Mirrors
 * the canonical shape in `audioDevices.tsx`.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "favoritesManagerWindow" as const;

export type OpenFavoritesManagerWindowOptions = Record<string, never>;

export interface FavoritesManagerWindowHandle {
  close: () => void;
}

export function useOpenFavoritesManagerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      _opts: OpenFavoritesManagerWindowOptions = {},
    ): FavoritesManagerWindowHandle => {
      dispatch(openOverlay({ overlayId: OVERLAY_ID }));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function FavoritesManagerWindowController(
  props: OpenFavoritesManagerWindowOptions,
): null {
  const open = useOpenFavoritesManagerWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open]);
  return null;
}
