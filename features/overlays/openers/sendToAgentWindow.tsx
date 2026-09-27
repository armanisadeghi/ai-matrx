"use client";

/**
 * Opener for the `sendToAgentWindow` overlay — "Send to another agent…": pick
 * any agent (THE agent picker window), choose where the content goes (one of its variables or context
 * slots, "Important context", or "Your message"), and the agent opens in a
 * floating window with it in place, unsent.
 *
 * - `useOpenSendToAgentWindow()` — imperative hook, returns a handle.
 * - `<SendToAgentWindowController />` — declarative wrapper.
 * - `sendToAgentWindowAction()` — the plain action, for non-React callers (the
 *   rich-document action handler, which has `dispatch` but no hooks).
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "sendToAgentWindow" as const;

export interface OpenSendToAgentWindowOptions {
  /** The text being sent on to another agent. */
  initialContent: string;
  /** Where it came from (e.g. the conversation title) — shown in the window. */
  initialSourceTitle?: string | null;
}

export interface SendToAgentWindowHandle {
  close: () => void;
}

export function sendToAgentWindowAction(opts: OpenSendToAgentWindowOptions) {
  return openOverlay({
    overlayId: OVERLAY_ID,
    data: {
      initialContent: opts.initialContent,
      initialSourceTitle: opts.initialSourceTitle ?? null,
    },
  });
}

export function useOpenSendToAgentWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenSendToAgentWindowOptions): SendToAgentWindowHandle => {
      dispatch(sendToAgentWindowAction(opts));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export function SendToAgentWindowController(
  props: OpenSendToAgentWindowOptions,
): null {
  const open = useOpenSendToAgentWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [
    open,
    props.initialContent,
    props.initialSourceTitle,
  ]);
  return null;
}
