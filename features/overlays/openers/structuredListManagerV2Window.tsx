"use client";

/**
 * Opener for the `picklistManagerV2Window` overlay.
 *
 * - `useOpenPicklistManagerV2Window()` — imperative hook. Pass `forcedListId`
 *   to open in single-list mode (switcher hidden); omit it to open the full
 *   browse view.
 * - `<PicklistManagerV2WindowController />` — declarative wrapper. Mount to
 *   open, unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "picklistManagerV2Window" as const;

export interface OpenPicklistManagerV2WindowOptions {
  title?: string;
  /** When set, opens in single-list mode pinned to this picklist. */
  forcedListId?: string | null;
}

export interface PicklistManagerV2WindowHandle {
  close: () => void;
}

export function useOpenPicklistManagerV2Window() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenPicklistManagerV2WindowOptions = {},
    ): PicklistManagerV2WindowHandle => {
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

export function PicklistManagerV2WindowController(
  props: OpenPicklistManagerV2WindowOptions,
): null {
  const open = useOpenPicklistManagerV2Window();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.title, props.forcedListId]);
  return null;
}
