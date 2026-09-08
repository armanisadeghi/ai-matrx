"use client";

import { ChatRoomClient } from "./ChatRoomClient";
import { ChatMandateUnavailable, ChatNewLandingSkeleton } from "./ChatNewClient";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";
import { useMandate } from "@/features/mandates/useMandate";

/**
 * `/chat/[conversationId]` — the room for an EXISTING conversation.
 *
 * A conversation does not need an agent to exist. `initial_agent_id` is
 * provenance ("which agent started it"), and thousands of live rows carry
 * none: model-direct API turns, coding-session mirrors, workflow runs, proof
 * runs. Until 2026-09-08 the route treated a NULL agent as "not found" and
 * hard-redirected to `/chat/new` — every one of those conversations was a
 * dead end from the sidebar.
 *
 * Two mount paths, one component:
 *  - the conversation names its agent → mount that agent, exactly as before;
 *  - it names none → the room is owned by the `chat.default_new_chat` MANDATE,
 *    the same door `/chat/new` uses. The server page resolved it at SSR (no
 *    client flash); if that failed (`agentId === null`) we re-resolve through
 *    the one client resolver and go loud on failure — never a hardcoded agent.
 *    `mandateKey` rides along so the next turn is answered by whoever the
 *    org/user binding says, not by a frozen display identity.
 */
export function ChatConversationRoom({
  conversationId,
  agentId,
  ownedByMandate,
}: {
  conversationId: string;
  /** The conversation's own agent, or the SSR-resolved mandate agent, or null. */
  agentId: string | null;
  /** True when `agentId` is the mandate's display identity, not the row's. */
  ownedByMandate: boolean;
}) {
  if (agentId && !ownedByMandate) {
    return <ChatRoomClient agentId={agentId} conversationId={conversationId} />;
  }
  if (agentId) {
    return (
      <ChatRoomClient
        agentId={agentId}
        conversationId={conversationId}
        mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
      />
    );
  }
  return <ChatConversationRoomResolved conversationId={conversationId} />;
}

/** SSR mandate resolution failed — re-resolve client-side, loud on failure. */
function ChatConversationRoomResolved({
  conversationId,
}: {
  conversationId: string;
}) {
  const { mandate, loading, error } = useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  if (loading) return <ChatNewLandingSkeleton />;
  if (error || !mandate) return <ChatMandateUnavailable error={error} />;
  return (
    <ChatRoomClient
      agentId={mandate.agentId}
      conversationId={conversationId}
      mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
    />
  );
}
