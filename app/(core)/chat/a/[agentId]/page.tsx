import { createClient } from "@/utils/supabase/server";
import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";

interface DirectAgentChatPageProps {
  params: Promise<{ agentId: string }>;
}

/**
 * Resolves just the agent's display name — single-column query so first paint
 * has a real label for the picker without forcing the full agent fetch on the
 * server. Returns `null` on missing/RLS-denied; the client renders "Select an
 * agent" in that case (rare — usually means the link is stale).
 */
async function resolveAgentName(agentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agx_agent")
    .select("name")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string | null) ?? null;
}

/**
 * Direct-to-agent chat route. Mounts the chat shell with an `agentId` but no
 * `conversationId` — `ChatRoomClient` creates a fresh instance via
 * `useAgentLauncher`. After the user sends their first message, the client
 * `router.replace`s to `/chat/[conversationId]` so the URL no longer pins
 * them to the agent route.
 */
export default async function DirectAgentChatPage({
  params,
}: DirectAgentChatPageProps) {
  const { agentId } = await params;
  const agentName = await resolveAgentName(agentId);
  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={agentId}
          initialAgentName={agentName ?? undefined}
        />
      </PageHeader>
      <ChatRoomClient agentId={agentId} />
    </>
  );
}
