import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

/**
 * First-paint: SSR resolves the owning agentId AND the agent's display name
 * for the conversation so the client shell can mount without a round-trip
 * (and without showing "Loading…" in the picker — the dropdown is intentionally
 * lazy and only fetches on user click). The full bundle (messages, variables,
 * overrides, observability) is hydrated client-side via `loadConversation`.
 */
async function resolveConversationSeed(
  conversationId: string,
): Promise<{ agentId: string; agentName: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat").from("conversation")
    .select("initial_agent_id")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const agentId = (data.initial_agent_id as string | null) ?? null;
  if (!agentId) return null;
  // `chat.conversation` has no FK on `initial_agent_id`, so the agent name
  // cannot be a PostgREST embed — resolve it with a separate lookup against
  // the canonical `agent.definition` table.
  const { data: agentRow } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .eq("id", agentId)
    .maybeSingle();
  const agentName = (agentRow?.name as string | null) ?? null;
  return { agentId, agentName };
}

export default async function ChatConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;

  const seed = await resolveConversationSeed(conversationId);
  if (!seed) {
    redirect("/chat/new");
  }

  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={seed.agentId}
          initialAgentName={seed.agentName ?? undefined}
          conversationId={conversationId}
        />
      </PageHeader>
      <ChatRoomClient agentId={seed.agentId} conversationId={conversationId} />
    </>
  );
}
