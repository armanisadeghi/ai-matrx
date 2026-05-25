"use client";

/**
 * Opener for the `picklistManagerV1Window` overlay.
 *
 * - `useOpenPicklistManagerV1Window()` — imperative hook. Pass `forcedListId`
 *   to open in single-list mode (sidebar hidden); omit it to open the full
 *   browse view.
 * - `<PicklistManagerV1WindowController />` — declarative wrapper. Mount to
 *   open, unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "picklistManagerV1Window" as const;

export interface OpenPicklistManagerV1WindowOptions {
  title?: string;
  /** When set, opens in single-list mode pinned to this picklist. */
  forcedListId?: string | null;
}

export interface PicklistManagerV1WindowHandle {
  close: () => void;
}

export function useOpenPicklistManagerV1Window() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenPicklistManagerV1WindowOptions = {},
    ): PicklistManagerV1WindowHandle => {
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

export function PicklistManagerV1WindowController(
  props: OpenPicklistManagerV1WindowOptions,
): null {
  const open = useOpenPicklistManagerV1Window();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.title, props.forcedListId]);
  return null;
}
