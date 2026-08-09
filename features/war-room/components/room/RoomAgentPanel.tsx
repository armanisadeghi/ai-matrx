"use client";

// features/war-room/components/room/RoomAgentPanel.tsx
//
// The body of a War Room's TIER-2 ROOM agent — the room's OVERSIGHT chat set,
// scoped to a READ-ONLY roster of every thread in THIS ONE room. The tier-2
// counterpart to MasterAgentPanel.
//
// The header is the SAME chrome as every thread tab: blue chat icon + the
// canonical AssociationEntitySelect over the room's `conversation → war_room`
// edges (label = conversation title, agent name until the first turn labels
// it; inline rename; switch; unlink; "+ New Chat" = the canonical agent
// picker → `startRoomConversation`). Binding/tools/context are owned by
// `useRoomAgent`, which only ever BINDS — the room's chat is created ONCE at
// war-room provisioning (invariant 11), never automatically here.
//
// It REUSES the canonical `AgentConversationColumn` (the same column the /chat
// route, agent runner, Scribe assistant, and the master panel render)
// unchanged — composer + streaming all key off the conversationId.
//
// Heavy by construction (the column pulls the agent execution graph). The room
// shell loads THIS component lazily (next/dynamic, ssr:false) so the graph
// stays out of the /war-room/[id] bundle until the user opens the panel.

import { Loader2, MessageCircle, Plus } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AssociationEntitySelect } from "@/features/scopes/components/associations/AssociationEntitySelect";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { SlotAgentPicker } from "@/features/agents/slots/components/SlotAgentPicker";
import { WAR_ROOM_ROOM_AGENT_SLOT } from "@/features/war-room/constants";
import { useRoomAgent } from "@/features/war-room/hooks/useRoomAgent";
import { useRoomConversationSelectAdapter } from "@/features/war-room/hooks/useThreadEntitySelect";
import { startRoomConversation } from "@/features/war-room/redux/thunks";

export default function RoomAgentPanel({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const { conversationId, loaded, ready } = useRoomAgent(sessionId);
  const adapter = useRoomConversationSelectAdapter(sessionId);
  // The persona a NEW room chat starts with. Unresolved ⇒ Start chat is
  // disabled and says why — never a hardcoded fallback id.
  const { slot: roomSlot, error: roomSlotError } = useAgentSlot(
    WAR_ROOM_ROOM_AGENT_SLOT,
  );
  const roomAgentId = roomSlot?.agentId ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header — identical chrome to the thread tabs: icon + the canonical
          chat select. shrink-0 so the column below owns the remaining height. */}
      <header className="flex h-7 shrink-0 items-center gap-1 border-b border-border/60 pl-1.5 pr-1">
        <AssociationEntitySelect
          token="conversation"
          adapter={adapter}
          align="start"
          emptyLabel="Room chat"
          iconClassName="text-primary"
          className="min-w-0 flex-1"
          createSlot={(close) => (
            <AgentListDropdown
              onSelect={(agentId) => {
                void dispatch(startRoomConversation(sessionId, agentId));
                close();
              }}
              triggerSlot={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  New Chat
                </button>
              }
            />
          )}
        />
      </header>

      {/* Body — the real conversation column; an explicit Start-chat state for
          legacy rooms with no chat (never auto-created); else loading. */}
      <div className="min-h-0 flex-1">
        {ready && conversationId ? (
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey="war-room-room-agent"
            constrainWidth
          />
        ) : loaded && adapter.items.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <MessageCircle
                className="size-5 text-muted-foreground/60"
                aria-hidden
              />
              <span className="text-xs text-muted-foreground">
                This room has no oversight chat yet
              </span>
              <button
                type="button"
                disabled={!roomAgentId}
                title={roomSlotError ?? undefined}
                onClick={() => {
                  if (!roomAgentId) return;
                  void dispatch(startRoomConversation(sessionId, roomAgentId));
                }}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Start chat
              </button>
              <SlotAgentPicker slotKey={WAR_ROOM_ROOM_AGENT_SLOT} />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
