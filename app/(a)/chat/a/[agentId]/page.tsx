import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";

interface DirectAgentChatPageProps {
  params: Promise<{ agentId: string }>;
}

/**
 * Direct-to-agent chat route. Mounts the chat shell with an `agentId` but no
 * `conversationId` — `ChatRoomClient` creates a fresh instance via
 * `useAgentLauncher`. After the first user submit, the streaming thunk's
 * `record_reserved` event yields the canonical conversation UUID and a
 * `pendingNavigation` effect calls `router.replace(/chat/[conversationId])`.
 */
export default async function DirectAgentChatPage({
  params,
}: DirectAgentChatPageProps) {
  const { agentId } = await params;
  return <ChatRoomClient agentId={agentId} />;
}
