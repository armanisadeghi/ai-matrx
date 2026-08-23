"use client";

// features/voice-agent/relay/VoiceChatClient.tsx
//
// `/chat/talk` — the ordinary chat room with the voice layer docked above its
// composer. THIS IS NOT A SECOND CHAT: it mounts the same `ChatRoomClient`
// every text route mounts, so the transcript, the composer, history, resume,
// canvas, tools and the agent picker are all the canonical ones. The only
// difference is a dock above the input and the fact that both the picker and
// the URL promotion keep you in voice instead of dropping you into text.
//
// SoR: common-docs/systems/agents/voice/STATE.md

import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { chatRouteSurfaceKey } from "@/features/agents/components/chat/begin-fresh-chat";
import { VoiceRelayDock } from "./VoiceRelayDock";

/** Registered `source_feature` — this is the voice-agent product surface. */
const SOURCE_FEATURE = "voice-agent" as const;

/** Fresh voice chat with an agent. */
export const voiceChatAgentHref = (agentId: string) =>
  `/chat/talk/a/${encodeURIComponent(agentId)}`;

/** A persisted voice conversation. */
export const voiceChatConversationHref = (conversationId: string) =>
  `/chat/talk/${conversationId}`;

export function VoiceChatClient({
  agentId,
  conversationId,
}: {
  agentId: string;
  conversationId?: string;
}) {
  return (
    <ChatRoomClient
      agentId={agentId}
      conversationId={conversationId}
      buildConversationHref={voiceChatConversationHref}
      aboveInput={(roomConversationId) => (
        <VoiceRelayDock
          primaryAgentId={agentId}
          // The room's own conversation — never a second one resolved here.
          conversationId={roomConversationId}
          surfaceKey={chatRouteSurfaceKey(agentId)}
          sourceFeature={SOURCE_FEATURE}
          questionPacing="one_at_a_time"
        />
      )}
    />
  );
}
