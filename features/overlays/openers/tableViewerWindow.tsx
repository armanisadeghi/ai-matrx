"use client";

/**
 * Opener for the `tableViewerWindow` overlay.
 *
 * - `useOpenTableViewerWindow()` — imperative hook. Call to open with typed
 *   options; returns a handle with a `close()` method.
 * - `<TableViewerWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 *
 * Opens a markdown table at full size in a floating WindowPanel.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "tableViewerWindow" as const;

export interface OpenTableViewerWindowOptions {
  content?: string;
  title?: string;
}

export interface TableViewerWindowHandle {
  close: () => void;
}

export function useOpenTableViewerWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenTableViewerWindowOptions = {}): TableViewerWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            content: opts.content,
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
export function TableViewerWindowController(
  props: OpenTableViewerWindowOptions,
): null {
  const open = useOpenTableViewerWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.content, props.title]);
  return null;
}
