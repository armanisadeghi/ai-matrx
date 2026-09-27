"use client";

/**
 * Opener for the `customAgentWindow` overlay — "Custom agent…": THE agent
 * picker window, then map the agent's inputs to what the menu captured.
 *
 * - `customAgentWindowAction()` — the plain action, for non-React callers (the
 *   rich-document action handler has `dispatch` but no hooks).
 * - `useOpenCustomAgentWindow()` — imperative hook.
 *
 * The captured values never enter Redux: they go in the custom-agent session
 * map and only the session id travels in the overlay data.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  registerCustomAgentSession,
  type CustomAgentSession,
} from "@/features/agents/components/custom-agent/session";

const OVERLAY_ID = "customAgentWindow" as const;

export function customAgentWindowAction(session: CustomAgentSession) {
  const sessionId = registerCustomAgentSession(session);
  return openOverlay({
    overlayId: OVERLAY_ID,
    instanceId: sessionId,
    data: { sessionId },
  });
}

export function useOpenCustomAgentWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (session: CustomAgentSession) => {
      dispatch(customAgentWindowAction(session));
    },
    [dispatch],
  );
}
