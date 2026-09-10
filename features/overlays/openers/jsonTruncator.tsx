"use client";

/**
 * Opener for the `jsonTruncator` overlay.
 *
 * - `useOpenJsonTruncatorDialog()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<JsonTruncatorDialogController />` — declarative wrapper. Mount to open,
 *   unmount to close. Equivalent ergonomics to rendering a normal component.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "jsonTruncator" as const;

export interface OpenJsonTruncatorDialogOptions {
  title?: string;
  id?: string;
  /** TODO: tighten to `JsonTruncatorTab` once that type is imported. */
  defaultTab?: unknown;
}

export interface JsonTruncatorDialogHandle {
  close: () => void;
}

export function useOpenJsonTruncatorDialog() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenJsonTruncatorDialogOptions = {}): JsonTruncatorDialogHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            title: opts.title,
            id: opts.id,
            defaultTab: opts.defaultTab,
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
 * closes it on unmount. Use this when a caller wants to express overlay
 * state declaratively (the way they'd render a normal component).
 */
export function JsonTruncatorDialogController(props: OpenJsonTruncatorDialogOptions): null {
  const open = useOpenJsonTruncatorDialog();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.title, props.id, props.defaultTab]);
  return null;
}
