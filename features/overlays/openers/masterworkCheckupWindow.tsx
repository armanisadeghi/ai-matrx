"use client";

/**
 * Opener for the `masterworkCheckupWindow` overlay — the Final Checkup an
 * Expert opens from their Rulebook when they feel done.
 *
 * - `useOpenMasterworkCheckupWindow()` — imperative hook, returns a handle.
 * - `<MasterworkCheckupWindowController />` — declarative wrapper.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "masterworkCheckupWindow" as const;

export interface OpenMasterworkCheckupWindowOptions {
  /** The Rulebook being checked. The window is meaningless without it. */
  rulebookId: string;
}

export interface MasterworkCheckupWindowHandle {
  close: () => void;
}

export function useOpenMasterworkCheckupWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (
      opts: OpenMasterworkCheckupWindowOptions,
    ): MasterworkCheckupWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { rulebookId: opts.rulebookId },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function MasterworkCheckupWindowController(
  props: OpenMasterworkCheckupWindowOptions,
): null {
  const open = useOpenMasterworkCheckupWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.rulebookId]);
  return null;
}
