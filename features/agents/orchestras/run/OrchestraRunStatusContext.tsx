// features/agents/orchestras/run/OrchestraRunStatusContext.tsx
//
// Distributes live member-run status to the builder's node/card components.
// Context (not node `data`) on purpose: the canvas's React-Flow node list is
// reconciled by a `sig`-keyed effect, and pushing volatile run state through
// node data would rebuild every node per status tick. MemberNode / grid rows
// read their own agent's status from here instead.

"use client";

import { createContext, useContext } from "react";
import type { SubAgentRunState } from "./orchestra-run-status.selectors";
import type { OrchestraMemberRunStatus } from "./useOrchestraMemberRunStatus";

const IDLE: OrchestraMemberRunStatus = { byAgentId: {}, isRunning: false };

export const OrchestraRunStatusContext = createContext<OrchestraMemberRunStatus>(IDLE);

/** A single member's live state — null = idle (current look). */
export function useMemberRunState(agentId: string): SubAgentRunState | null {
  const { byAgentId } = useContext(OrchestraRunStatusContext);
  return byAgentId[agentId] ?? null;
}
