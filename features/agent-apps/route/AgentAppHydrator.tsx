"use client";

/**
 * AgentAppHydrator — client island that seeds the agent-apps Redux slice with
 * a single fetched-on-the-server `AgentApp` record. Sub-routes under
 * /agent-apps/[id] read from Redux via selectors; this hydrator is the bridge
 * between the layout's server fetch and that client-side state.
 *
 * Mirrors features/agents/route/AgentHydrator.tsx.
 */

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { agentAppActions } from "@/features/agents/redux/agent-apps/slice";
import type { AgentApp } from "@/features/agent-apps/types";

export function AgentAppHydrator({ app }: { app: AgentApp }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(agentAppActions.upsertApp(app));
    dispatch(agentAppActions.setActiveAppId(app.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  return null;
}
