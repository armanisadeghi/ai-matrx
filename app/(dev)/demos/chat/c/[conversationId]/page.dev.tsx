// app/(dev)/demos/chat/c/[conversationId]/page.tsx — Active conversation view.

import ChatHeaderControls from "@ai-matrx/chat/cx-chat/components/ChatHeaderControls";
import { ChatInstanceManager } from "@ai-matrx/chat/cx-chat/components/ChatInstanceManager";
import { DEFAULT_AGENT_ID } from "@ai-matrx/chat/cx-chat/components/agent/local-agents";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";
import { resolveMandateSeed } from "@/features/mandates/seed.server";
import { FastPathMandateGuard } from "@ai-matrx/chat/mandates/FastPathMandateGuard";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ agent?: string }>;
}) {
  const [{ conversationId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  // No explicit ?agent → the `chat.default_new_chat` mandate decides, same as
  // the core `/chat/new` route. A resolution failure on this dev demo screams
  // and falls back to the documented seed mirror rather than 500ing the page.
  let agentId = resolvedSearchParams.agent ?? null;
  let usedSeedMirror = false;
  if (!agentId) {
    // BOUNDED — see seed.server.ts.
    const seededId = (await resolveMandateSeed(DEFAULT_NEW_CHAT_MANDATE_KEY))
      .agentId;
    usedSeedMirror = !seededId;
    agentId = seededId ?? DEFAULT_AGENT_ID;
  }

  return (
    <>
      <ChatHeaderControls />
      {/* The seed mirror launched without a resolved Mandate — the browser
          re-asks `chat.default_new_chat` and screams to admins on a mismatch. */}
      {usedSeedMirror ? (
        <FastPathMandateGuard
          mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
          hardcodedAgentId={DEFAULT_AGENT_ID}
          surface="app/(dev)/demos/chat/c/[conversationId]/page.dev.tsx (SSR seed fallback)"
        />
      ) : null}
      <ChatInstanceManager
        mode="conversation"
        agentId={agentId}
        conversationId={conversationId}
      />
    </>
  );
}
