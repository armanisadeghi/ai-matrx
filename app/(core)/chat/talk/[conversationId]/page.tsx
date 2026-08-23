import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  VoiceChatClient,
  voiceChatAgentHref,
} from "@/features/voice-agent/relay/VoiceChatClient";

interface VoiceChatConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

/**
 * Which agent owns this conversation, plus its name for first paint. Mirrors
 * `/chat/[conversationId]` exactly — `chat.conversation` has no FK on
 * `initial_agent_id`, so the name needs its own lookup.
 */
async function resolveConversationSeed(
  conversationId: string,
): Promise<{ agentId: string; agentName: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select("initial_agent_id")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const agentId = (data.initial_agent_id as string | null) ?? null;
  if (!agentId) return null;
  const { data: agentRow } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .eq("id", agentId)
    .maybeSingle();
  return { agentId, agentName: (agentRow?.name as string | null) ?? null };
}

/**
 * A persisted conversation, opened in voice — the voice twin of
 * `/chat/[conversationId]`. Same conversation rows, same history: the text and
 * voice routes are two doors onto one thread, which is the whole point of the
 * layer being an option rather than a mode of its own.
 */
export default async function VoiceChatConversationPage({
  params,
}: VoiceChatConversationPageProps) {
  const { conversationId } = await params;
  const seed = await resolveConversationSeed(conversationId);
  if (!seed) {
    // The conversation is gone or unreadable — fall back to the text room,
    // which owns the honest access state for a conversation we can't open.
    redirect(`/chat/${conversationId}`);
  }

  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={seed.agentId}
          initialAgentName={seed.agentName ?? undefined}
          conversationId={conversationId}
          buildAgentHref={voiceChatAgentHref}
        />
      </PageHeader>
      <VoiceChatClient
        agentId={seed.agentId}
        conversationId={conversationId}
      />
    </>
  );
}
