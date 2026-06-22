"use client";

// features/war-room/components/master/MasterAgentPanel.tsx
//
// The body of the War Room MASTER agent — a real chat the user composes in,
// scoped to a READ-ONLY roster of EVERY room + thread they own.
//
// It REUSES the canonical `AgentConversationColumn` (the same column the /chat
// route, agent runner, and Scribe assistant render) unchanged — composer +
// streaming all key off the conversationId. The cross-room context + durable
// conversation are owned by `useMasterAgent`; this component is just the header
// + the column + a loading state until the conversation resolves.
//
// Heavy by construction (the column pulls the agent execution graph). The /all
// view loads THIS component lazily (next/dynamic, ssr:false) so the graph stays
// out of the /war-room/all bundle.

import { Radar, Loader2 } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useMasterAgent } from "@/features/war-room/hooks/useMasterAgent";
import { WarRoomAgentSelector } from "@/features/war-room/components/shared/WarRoomAgentSelector";

export default function MasterAgentPanel() {
  const { conversationId, agentId, ready, switchAgent } = useMasterAgent();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header — the active agent (visible + swappable) + its scope. shrink-0
          so the column below owns the remaining height. */}
      <header className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="grid place-items-center size-6 shrink-0 text-primary">
          <Radar className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <WarRoomAgentSelector
            agentId={agentId}
            onSwitch={switchAgent}
            fallbackLabel="Master Agent"
          />
          <p className="px-1 text-[11px] text-muted-foreground leading-tight truncate">
            Sees every room and thread you own
          </p>
        </div>
      </header>

      {/* Body — the real conversation column, or a loading state until the
          durable conversation resolves. */}
      <div className="min-h-0 flex-1">
        {ready && conversationId ? (
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey="war-room-master"
            constrainWidth
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
