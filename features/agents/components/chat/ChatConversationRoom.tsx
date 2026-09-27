"use client";

import { ChatRoomClient } from "./ChatRoomClient";
import { ChatMandateUnavailable, ChatNewLandingSkeleton } from "./ChatNewClient";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";
import { useMandate } from "@/features/mandates/useMandate";
import type { ConversationSandboxBinding } from "@/lib/sandbox/conversation-binding-row";
import { WorkspaceGate } from "@/features/organizations/components/WorkspaceGate";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";

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
  sandboxBinding = null,
  composer,
}: {
  conversationId: string;
  /** The conversation's own agent, or the SSR-resolved mandate agent, or null. */
  agentId: string | null;
  /** True when `agentId` is the mandate's display identity, not the row's. */
  ownedByMandate: boolean;
  /**
   * The box the ROW says this conversation is bound to, read at SSR. Carried
   * to the room so the compute control names it on the first render rather
   * than after the bundle RPC.
   */
  sandboxBinding?: ConversationSandboxBinding | null;
  /** The three-mode composer (server-read "last mode used" cookie). */
  composer?: { initialMode: ComposerMode | null };
}) {
  if (agentId && !ownedByMandate) {
    return (
      <ChatRoomClient
        agentId={agentId}
        conversationId={conversationId}
        sandboxBinding={sandboxBinding}
        composer={composer}
      />
    );
  }
  if (agentId) {
    return (
      <ChatRoomClient
        agentId={agentId}
        conversationId={conversationId}
        mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
        sandboxBinding={sandboxBinding}
        composer={composer}
      />
    );
  }
  return (
    <ChatConversationRoomResolved
      conversationId={conversationId}
      sandboxBinding={sandboxBinding}
      composer={composer}
    />
  );
}

/** SSR mandate resolution failed — re-resolve client-side, loud on failure. */
function ChatConversationRoomResolved({
  conversationId,
  sandboxBinding,
  composer,
}: {
  conversationId: string;
  sandboxBinding: ConversationSandboxBinding | null;
  composer?: { initialMode: ComposerMode | null };
}) {
  const { mandate, loading, error, organizationPending } = useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  if (loading) return <ChatNewLandingSkeleton />;
  // No workspace chosen is a question, never "chat is unavailable".
  if (organizationPending) {
    return (
      <WorkspaceGate blocked sentence="This chat needs a workspace to open.">
        <ChatNewLandingSkeleton />
      </WorkspaceGate>
    );
  }
  if (error || !mandate) return <ChatMandateUnavailable error={error} />;
  return (
    <ChatRoomClient
      agentId={mandate.agentId}
      conversationId={conversationId}
      mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
      sandboxBinding={sandboxBinding}
      composer={composer}
    />
  );
}
