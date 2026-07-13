"use client";

/**
 * Opener for the `userTableWindow` overlay.
 *
 * - `useOpenUserTableWindow()` — imperative hook. Call to open with typed
 *   options; returns a handle with a `close()` method.
 * - `<UserTableWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 *
 * Opens a saved UDT dataset table (by id) at full size in a floating
 * WindowPanel via the realtime UserTableViewer.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "userTableWindow" as const;

export interface OpenUserTableWindowOptions {
  tableId?: string;
  title?: string;
}

export interface UserTableWindowHandle {
  close: () => void;
}

export function useOpenUserTableWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenUserTableWindowOptions = {}): UserTableWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            tableId: opts.tableId,
            title: opts.title,
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

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function UserTableWindowController(
  props: OpenUserTableWindowOptions,
): null {
  const open = useOpenUserTableWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.tableId, props.title]);
  return null;
}
