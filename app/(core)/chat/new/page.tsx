import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { ChatNewClient } from "@/features/agents/components/chat/ChatNewClient";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "@/features/agents/components/chat/chat-quick-actions.config";

/**
 * Single-column SSR lookup for the default agent's display name so the chat
 * picker bar has a real label on first paint (instead of the bare placeholder
 * or a "loading" flicker). The lazy `AgentListDropdown` still defers its full
 * fetch until the user actually clicks the picker.
 */
async function resolveDefaultAgentName(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agx_agent")
    .select("name")
    .eq("id", DEFAULT_NEW_CHAT_AGENT_ID)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string | null) ?? null;
}

export default async function NewChatPage() {
  const defaultAgentName = await resolveDefaultAgentName();
  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={DEFAULT_NEW_CHAT_AGENT_ID}
          initialAgentName={defaultAgentName ?? undefined}
        />
      </PageHeader>
      <Suspense
        fallback={
          <div className="h-[calc(100dvh-var(--header-height,2.5rem))]" />
        }
      >
        <ChatNewClient />
      </Suspense>
    </>
  );
}
