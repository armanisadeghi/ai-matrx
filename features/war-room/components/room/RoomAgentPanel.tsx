"use client";

// features/war-room/components/room/RoomAgentPanel.tsx
//
// The body of a War Room's TIER-2 ROOM agent — a real chat the user composes in,
// scoped to a READ-ONLY roster of every thread in THIS ONE room. The tier-2
// counterpart to MasterAgentPanel: same construction, narrowed from all-rooms to
// a single session.
//
// It REUSES the canonical `AgentConversationColumn` (the same column the /chat
// route, agent runner, Scribe assistant, and the master panel render) unchanged
// — composer + streaming all key off the conversationId. The single-room context
// + durable per-room conversation are owned by `useRoomAgent`; this component is
// just the header + the column + a loading state until the conversation resolves.
//
// Heavy by construction (the column pulls the agent execution graph). The room
// shell loads THIS component lazily (next/dynamic, ssr:false) so the graph stays
// out of the /war-room/[id] bundle until the user opens the panel.

import { Bot, Loader2 } from "lucide-react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useRoomAgent } from "@/features/war-room/hooks/useRoomAgent";
import { WarRoomAgentSelector } from "@/features/war-room/components/shared/WarRoomAgentSelector";

export default function RoomAgentPanel({ sessionId }: { sessionId: string }) {
  const { conversationId, agentId, ready, switchAgent } = useRoomAgent(sessionId);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header — the active agent (visible + swappable) + its scope. shrink-0
          so the column below owns the remaining height. */}
      <header className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="grid place-items-center size-6 shrink-0 text-primary">
          <Bot className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <WarRoomAgentSelector
            agentId={agentId}
            onSwitch={switchAgent}
            fallbackLabel="Room Agent"
          />
          <p className="px-1 text-[11px] text-muted-foreground leading-tight truncate">
            Sees every thread in this room
          </p>
        </div>
      </header>

      {/* Body — the real conversation column, or a loading state until the
          durable conversation resolves. */}
      <div className="min-h-0 flex-1">
        {ready && conversationId ? (
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey="war-room-room-agent"
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
