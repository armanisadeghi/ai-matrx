"use client";

// providers/AgentPeekHost.tsx
//
// The ONE live host for `openAgentPeek(agentId)`. Renders the canonical
// `AgentPeekWindow` — a non-blocking, draggable WindowPanel wrapping the
// canonical `AgentSneakPeekContent` — never a second bespoke peek body.
//
// `next/dynamic({ ssr: false })` keeps WindowPanel and the sneak-peek body out
// of the static graph of every authenticated route; only this ~30-line shell
// is eagerly parsed. See the `code-splitting` skill, rule 3.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import {
  closeAgentPeek,
  getAgentPeekAgentId,
  subscribeAgentPeek,
} from "@/features/agents/components/agent-listings/openAgentPeek";

const AgentPeekWindow = dynamic(
  () => import("@/features/agents/orchestras/components/AgentPeekWindow"),
  { ssr: false, loading: () => null },
);

const serverSnapshot = () => null;

export function AgentPeekHost() {
  const agentId = useSyncExternalStore(
    subscribeAgentPeek,
    getAgentPeekAgentId,
    serverSnapshot,
  );
  if (!agentId) return null;
  return <AgentPeekWindow agentId={agentId} onClose={closeAgentPeek} />;
}
