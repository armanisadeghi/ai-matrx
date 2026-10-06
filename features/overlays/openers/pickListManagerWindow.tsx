"use client";

/**
 * Opener for the `pickListManagerWindow` overlay.
 *
 * - `useOpenPickListManagerWindow()` — imperative hook. Pass `forcedListId`
 *   to open in single-list mode (switcher hidden); omit it to open the full
 *   browse view.
 * - `<PickListManagerWindowController />` — declarative wrapper. Mount to
 *   open, unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "pickListManagerWindow" as const;

export interface OpenPickListManagerWindowOptions {
  title?: string;
  /** When set, opens in single-list mode pinned to this pick list. */
  forcedListId?: string | null;
}

export interface PickListManagerWindowHandle {
  close: () => void;
}

export function useOpenPickListManagerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenPickListManagerWindowOptions = {},
    ): PickListManagerWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            title: opts.title,
            forcedListId: opts.forcedListId ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function PickListManagerWindowController(
  props: OpenPickListManagerWindowOptions,
): null {
  const open = useOpenPickListManagerWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.title, props.forcedListId]);
  return null;
}
