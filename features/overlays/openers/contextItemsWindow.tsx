"use client";

/**
 * Opener for the `contextItemsWindow` overlay — the Add/Edit/Manage window
 * for a scope type's context items (sidebar list + closeable tabs).
 *
 * - `useOpenContextItemsWindow()` — imperative hook; returns a `close()` handle.
 * - `<ContextItemsWindowController />` — declarative wrapper (mount = open).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { ContextItemsWindowData } from "@/features/window-panels/windows/context-scopes/ContextItemsWindow";

const OVERLAY_ID = "contextItemsWindow" as const;

export type OpenContextItemsWindowOptions = ContextItemsWindowData;

export interface ContextItemsWindowHandle {
  close: () => void;
}

export function useOpenContextItemsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenContextItemsWindowOptions): ContextItemsWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            scopeTypeId: opts.scopeTypeId,
            initialItemId: opts.initialItemId ?? null,
            openNewOnMount: opts.openNewOnMount ?? false,
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

export function ContextItemsWindowController(
  props: OpenContextItemsWindowOptions,
): null {
  const open = useOpenContextItemsWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.scopeTypeId, props.initialItemId, props.openNewOnMount]);
  return null;
}
