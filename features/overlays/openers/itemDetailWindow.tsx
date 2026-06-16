"use client";

/**
 * Opener for the `itemDetailWindow` overlay.
 *
 * - `useOpenItemDetailWindow()` — imperative hook. Call to open with typed
 *   options; returns a handle with a `close()` method.
 * - `<ItemDetailWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 *
 * The generic fallback detail window for an `item_presentation` entity that
 * has no bespoke window yet. See `features/item-presentation/`.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { ItemType } from "@/features/item-presentation/types";

const OVERLAY_ID = "itemDetailWindow" as const;

export interface OpenItemDetailWindowOptions {
  itemType?: ItemType | null;
  itemId?: string | null;
  /** Agent-known name, shown instantly until the row loads. */
  initialName?: string | null;
  /** Agent-known one-liner, shown instantly until the row loads. */
  initialAbout?: string | null;
}

export interface ItemDetailWindowHandle {
  close: () => void;
}

export function useOpenItemDetailWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenItemDetailWindowOptions = {}): ItemDetailWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            itemType: opts.itemType,
            itemId: opts.itemId,
            initialName: opts.initialName,
            initialAbout: opts.initialAbout,
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
export function ItemDetailWindowController(
  props: OpenItemDetailWindowOptions,
): null {
  const open = useOpenItemDetailWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.itemType, props.itemId, props.initialName, props.initialAbout]);
  return null;
}
