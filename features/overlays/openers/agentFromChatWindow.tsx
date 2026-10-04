"use client";

/**
 * Opener for the `agentFromChatWindow` overlay — "Make an agent from this chat".
 *
 * - `useOpenAgentFromChatWindow()` — imperative hook; returns a handle with `close()`.
 * - `<AgentFromChatWindowController />` — declarative wrapper.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "agentFromChatWindow" as const;

export interface OpenAgentFromChatWindowOptions {
  conversationId: string;
  conversationTitle?: string | null;
}

export interface AgentFromChatWindowHandle {
  close: () => void;
}

export function useOpenAgentFromChatWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenAgentFromChatWindowOptions): AgentFromChatWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            conversationId: opts.conversationId,
            conversationTitle: opts.conversationTitle ?? null,
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

export function AgentFromChatWindowController(props: OpenAgentFromChatWindowOptions): null {
  const open = useOpenAgentFromChatWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open]);
  return null;
}
