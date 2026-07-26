"use client";

/**
 * Opener for the `agentSkillsWindow` overlay.
 *
 * `useOpenAgentSkillsWindow()` — imperative hook. Call with an agent id to
 * open the non-blocking skills catalogue window; returns a handle with a
 * `close()` method.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "agentSkillsWindow" as const;

export interface AgentSkillsWindowHandle {
  close: () => void;
}

export function useOpenAgentSkillsWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (agentId: string): AgentSkillsWindowHandle => {
      dispatch(openOverlay({ overlayId: OVERLAY_ID, data: { agentId } }));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}
