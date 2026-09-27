"use client";

/**
 * `/chat/new` header — ChatRunHeader bound to the `chat.default_new_chat`
 * mandate. Normally the server page resolves the mandate at SSR and passes the id
 * straight through. When SSR resolution failed (`agentId === null`), this
 * wrapper re-resolves through the ONE client resolver — the same cached call
 * `ChatNewClient` makes — so the header picker and the composer can never
 * disagree about which agent owns the landing (they either both resolve to
 * the same cached value or both surface the failure).
 */

import { ChatRunHeader } from "./ChatRunHeader";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";
import { useMandate } from "@/features/mandates/useMandate";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";

export function ChatNewHeader({
  agentId,
  initialAgentName,
  composerMode,
}: {
  agentId: string | null;
  initialAgentName?: string;
  composerMode?: { initialMode: ComposerMode | null };
}) {
  return agentId ? (
    <ChatRunHeader
      activeAgentId={agentId}
      initialAgentName={initialAgentName}
      composerMode={composerMode}
    />
  ) : (
    <ChatNewHeaderResolved composerMode={composerMode} />
  );
}

function ChatNewHeaderResolved({
  composerMode,
}: {
  composerMode?: { initialMode: ComposerMode | null };
}) {
  const { mandate } = useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY);
  // While resolving (or unresolvable) the picker shows its generic
  // placeholder — the body shows the loud error state for the same failure.
  return <ChatRunHeader activeAgentId={mandate?.agentId} composerMode={composerMode} />;
}
