"use client";

/**
 * Opener for the `runControlsWindow` overlay — the "Chat Options" run-controls
 * window (Attach / Context / Document / Overrides / Tools / Skills / Sandbox /
 * Settings / Preferences / Creator) for one conversation.
 *
 * - `useOpenRunControlsWindow()` — imperative hook. Call to open with typed
 *   options; returns a handle with a `close()` method.
 * - `<RunControlsWindowController />` — declarative wrapper. Mount to open,
 *   unmount to close.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { RunControlsTab } from "@/features/agents/components/inputs/smart-input/RunControlsTabPanel";

const OVERLAY_ID = "runControlsWindow" as const;

export interface OpenRunControlsWindowOptions {
  conversationId: string;
  /** Show the Attach tab (the `/chat/new` "+" variant). Default false. */
  includeAttach?: boolean;
  /** Tab to land on. Defaults to the surface's natural first tab. */
  initialTab?: RunControlsTab;
}

export interface RunControlsWindowHandle {
  close: () => void;
}

export function useOpenRunControlsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenRunControlsWindowOptions): RunControlsWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            conversationId: opts.conversationId,
            includeAttach: opts.includeAttach ?? false,
            initialTab: opts.initialTab ?? null,
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
export function RunControlsWindowController(
  props: OpenRunControlsWindowOptions,
): null {
  const open = useOpenRunControlsWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.conversationId, props.includeAttach, props.initialTab]);
  return null;
}
