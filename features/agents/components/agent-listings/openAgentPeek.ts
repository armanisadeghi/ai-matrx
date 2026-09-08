// features/agents/components/agent-listings/openAgentPeek.ts
//
// The imperative "quick look at this agent" entry point — the app service that
// fills `@ai-matrx/agents/catalog/react`'s `openPeek` port. Pure state: zero
// React, zero WindowPanel, so importing it costs a static-graph edge of a few
// lines. `<AgentPeekHost />` (mounted once in the provider tree) subscribes
// and renders the canonical `AgentPeekWindow`.
//
// A peek that has no host mounted is not a silent no-op: the opener reports it
// to the error inspector, because a "Quick look" affordance that does nothing
// is exactly the dead control the platform bans.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

type Listener = (agentId: string | null) => void;

const listeners = new Set<Listener>();
let currentAgentId: string | null = null;

/** @internal — for `<AgentPeekHost />` only. */
export function subscribeAgentPeek(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @internal — for `<AgentPeekHost />` only. */
export function getAgentPeekAgentId(): string | null {
  return currentAgentId;
}

function publish(next: string | null): void {
  currentAgentId = next;
  for (const listener of listeners) listener(next);
}

/** Open the non-blocking agent quick-look window for `agentId`. */
export function openAgentPeek(agentId: string): void {
  if (!agentId) return;
  if (listeners.size === 0) {
    captureError({
      source: "agent-catalog",
      code: "agent_peek_no_host",
      message:
        "openAgentPeek was called with no <AgentPeekHost /> mounted, so the " +
        "quick-look window cannot open.",
      userMessage:
        "Mount <AgentPeekHost /> in this provider tree (see app/Providers.tsx).",
    });
    return;
  }
  publish(agentId);
}

/** Close the quick-look window. */
export function closeAgentPeek(): void {
  publish(null);
}
