"use client";

/**
 * `/chat/new` header — ChatRunHeader bound to the `chat.default_new_chat`
 * slot. Normally the server page resolves the slot at SSR and passes the id
 * straight through. When SSR resolution failed (`agentId === null`), this
 * wrapper re-resolves through the ONE client resolver — the same cached call
 * `ChatNewClient` makes — so the header picker and the composer can never
 * disagree about which agent owns the landing (they either both resolve to
 * the same cached value or both surface the failure).
 */

import { ChatRunHeader } from "./ChatRunHeader";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "./chat-quick-actions.config";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";

export function ChatNewHeader({
  agentId,
  initialAgentName,
}: {
  agentId: string | null;
  initialAgentName?: string;
}) {
  return agentId ? (
    <ChatRunHeader activeAgentId={agentId} initialAgentName={initialAgentName} />
  ) : (
    <ChatNewHeaderResolved />
  );
}

function ChatNewHeaderResolved() {
  const { slot } = useAgentSlot(DEFAULT_NEW_CHAT_SLOT_KEY);
  // While resolving (or unresolvable) the picker shows its generic
  // placeholder — the body shows the loud error state for the same failure.
  return <ChatRunHeader activeAgentId={slot?.agentId} />;
}
