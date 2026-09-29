"use client";

/**
 * useChatCatalogueInit
 *
 * Responsible for ONE thing: keeping the agent catalogue warm.
 * Called once from ChatPanelContent (the sidebar). Never called from page components.
 *
 * - On mount: dispatch initializeChatAgents (TTL-guarded, 15 min).
 * - On tab shown change: revalidate if stale (4 hour threshold).
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  initializeChatAgents,
  isChatListStale,
} from "@/features/agents/redux/agent-definition/thunks";

export function useChatCatalogueInit() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isChatListStale()) {
        dispatch(initializeChatAgents({ force: true }));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [dispatch]);
}
