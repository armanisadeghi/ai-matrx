// features/agents/agent-sets/hooks/useEnsureAgentsLoaded.ts
"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";

/**
 * Load the user's agent list ONCE for the whole agent-sets surface. Uses the
 * canonical `initializeChatAgents` thunk, which is TTL-fresh + loading-guarded, so
 * mounting this on many components (builder, rail, dialogs) never refetches data we
 * already have. Never call `fetchAgentsList()` directly from this feature.
 *
 * Pass `enabled: false` while a dialog is closed so closed overlays don't
 * contribute to a mount-time fetch stampede (see AddToSetMenu / AgentCard).
 */
export function useEnsureAgentsLoaded(enabled = true) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!enabled) return;
    dispatch(initializeChatAgents());
  }, [dispatch, enabled]);
}
