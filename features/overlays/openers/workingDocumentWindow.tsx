"use client";

/**
 * Opener for the `workingDocumentWindow` overlay.
 *
 * - `useOpenWorkingDocumentWindow()` — imperative hook. Call to open the
 *   working document for a conversation in a floating window; returns a handle
 *   with `instanceId` + `close()`.
 * - `<WorkingDocumentWindowController />` — declarative wrapper.
 *
 * Multi-instance, keyed by conversationId: one window per conversation, so
 * re-opening for the same conversation focuses/replaces the existing one
 * instead of stacking duplicates.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "workingDocumentWindow" as const;

export interface OpenWorkingDocumentWindowOptions {
  conversationId: string;
}

export interface WorkingDocumentWindowHandle {
  instanceId: string;
  close: () => void;
}

function instanceIdFor(conversationId: string): string {
  return `${OVERLAY_ID}:${conversationId}`;
}

export function useOpenWorkingDocumentWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenWorkingDocumentWindowOptions): WorkingDocumentWindowHandle => {
      const instanceId = instanceIdFor(opts.conversationId);
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: { conversationId: opts.conversationId },
        }),
      );
      return {
        instanceId,
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens the overlay on mount,
 * closes it on unmount.
 */
export function WorkingDocumentWindowController(
  props: OpenWorkingDocumentWindowOptions,
): null {
  const open = useOpenWorkingDocumentWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.conversationId]);
  return null;
}
