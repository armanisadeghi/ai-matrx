import { createClient } from "@/utils/supabase/server";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  VoiceChatClient,
  voiceChatAgentHref,
} from "@/features/voice-agent/relay/VoiceChatClient";

interface VoiceChatAgentPageProps {
  params: Promise<{ agentId: string }>;
}

/** Display name for first paint, so the picker never shows a placeholder. */
async function resolveAgentName(agentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("name")
    .is("deleted_at", null)
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string | null) ?? null;
}

/**
 * Fresh voice conversation with one agent — the voice twin of
 * `/chat/a/[agentId]`. Once the conversation persists the client promotes the
 * URL to `/chat/talk/[conversationId]`, so a refresh mid-conversation comes
 * back to the same thread still in voice.
 *
 * The header picker builds voice hrefs too: switching agents from inside a
 * voice session keeps you in voice.
 */
export default async function VoiceChatAgentPage({
  params,
}: VoiceChatAgentPageProps) {
  const { agentId } = await params;
  const agentName = await resolveAgentName(agentId);
  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={agentId}
          initialAgentName={agentName ?? undefined}
          buildAgentHref={voiceChatAgentHref}
        />
      </PageHeader>
      <VoiceChatClient agentId={agentId} />
    </>
  );
}
