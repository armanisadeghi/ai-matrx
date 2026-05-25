"use client";

/**
 * Opener for the `creatorHub` overlay.
 *
 * - `useOpenCreatorHub()` — imperative hook. Call to open with typed options;
 *   returns a handle with a `close()` method.
 * - `<CreatorHubController />` — declarative wrapper. Mount to open, unmount to
 *   close.
 *
 * The main-sidebar Crown toggles this overlay directly (parity with the admin
 * Bug). This opener is for programmatic opens (e.g. the Creator tools tile).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "creatorHub" as const;

/**
 * Tab ids for the Creator Hub sidebar — also the deep-link `initialTab` set.
 * Lives here (the opener owns the open-options contract) rather than in the
 * window component, which can't be imported outside the registry.
 */
export type CreatorHubTabId =
  | "settings"
  | "data"
  | "context"
  | "payload"
  | "widget_invoker"
  | "run"
  | "sysprompt"
  | "last"
  | "model_context"
  | "session"
  | "client"
  | "backend"
  | "stream_debug"
  | "routing"
  | "memory"
  | "actions";

export interface OpenCreatorHubOptions {
  initialTab?: CreatorHubTabId | null;
}

export interface CreatorHubHandle {
  close: () => void;
}

export function useOpenCreatorHub() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenCreatorHubOptions = {}): CreatorHubHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: { initialTab: opts.initialTab },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function CreatorHubController(props: OpenCreatorHubOptions): null {
  const open = useOpenCreatorHub();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialTab]);
  return null;
}
