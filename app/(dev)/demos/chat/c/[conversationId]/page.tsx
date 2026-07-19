// app/(dev)/demos/chat/c/[conversationId]/page.tsx — Active conversation view.

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import { ChatInstanceManager } from "@/features/cx-chat/components/ChatInstanceManager";
import { DEFAULT_AGENT_ID } from "@/features/cx-chat/components/agent/local-agents";

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

  const agentId = resolvedSearchParams.agent ?? DEFAULT_AGENT_ID;

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
