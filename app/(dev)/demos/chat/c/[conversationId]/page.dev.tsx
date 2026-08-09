// app/(dev)/demos/chat/c/[conversationId]/page.tsx — Active conversation view.

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import { ChatInstanceManager } from "@/features/cx-chat/components/ChatInstanceManager";
import { DEFAULT_AGENT_ID } from "@/features/cx-chat/components/agent/local-agents";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { resolveAgentSlotServer } from "@/features/agents/slots/service.server";

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

  // No explicit ?agent → the `chat.default_new_chat` slot decides, same as
  // the core `/chat/new` route. A resolution failure on this dev demo screams
  // and falls back to the documented seed mirror rather than 500ing the page.
  let agentId = resolvedSearchParams.agent ?? null;
  if (!agentId) {
    try {
      agentId = (await resolveAgentSlotServer(DEFAULT_NEW_CHAT_SLOT_KEY)).agentId;
    } catch (error) {
      console.error(
        `[demos/chat] slot "${DEFAULT_NEW_CHAT_SLOT_KEY}" failed to resolve — using the seed mirror:`,
        error,
      );
      agentId = DEFAULT_AGENT_ID;
    }
  }

  return (
    <>
      <ChatHeaderControls />
      <ChatInstanceManager
        mode="conversation"
        agentId={agentId}
        conversationId={conversationId}
      />
    </>
  );
}
