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
 */
export function useEnsureAgentsLoaded() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);
}
