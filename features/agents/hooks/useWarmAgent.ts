"use client";

/**
 * useWarmAgent — fire-and-forget pre-warm POST to /ai/agents/{id}/warm
 * scheduled on idle so it never competes with first paint or hydration.
 *
 * Use this on any client surface that knows it will likely invoke a specific
 * agent next: agent-app public pages, conversation routers, sidebar previews.
 * The warm call is harmless if the agent ends up not being invoked.
 *
 * Resolves the backend URL from `selectResolvedBaseUrl` so the in-header
 * server picker is honored; falls back to nothing (no-op) when no URL is set.
 */

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { warmAgent } from "@/lib/api/warm-helpers";

interface UseWarmAgentOptions {
  /** Pass true when the id is an agx_version id rather than an agx_agent id. */
  isVersion?: boolean;
  /** Skip warming entirely (e.g. when the id isn't ready yet). */
  enabled?: boolean;
}

export function useWarmAgent(
  agentId: string | null | undefined,
  { isVersion = false, enabled = true }: UseWarmAgentOptions = {},
): void {
  const baseUrl = useAppSelector(
    selectResolvedBaseUrl as (state: unknown) => string | undefined,
  );

  useEffect(() => {
    if (!enabled || !agentId || !baseUrl) return undefined;

    const fire = () => warmAgent(agentId, { baseUrl, isVersion });

    // Fire on idle so this never competes with first paint, hydration, or
    // the user's own interaction. Falls back to a small timeout where
    // requestIdleCallback isn't available (Safari).
    const ric =
      typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    const cancel =
      typeof window !== "undefined" ? window.cancelIdleCallback : undefined;

    if (ric) {
      const handle = ric(fire, { timeout: 2000 });
      return () => cancel?.(handle);
    }

    const handle = window.setTimeout(fire, 500);
    return () => window.clearTimeout(handle);
  }, [agentId, baseUrl, isVersion, enabled]);
}
