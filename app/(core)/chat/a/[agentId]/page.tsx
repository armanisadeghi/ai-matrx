import { createClient } from "@/utils/supabase/server";
import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { ChatRunHeader } from "@/features/agents/components/chat/ChatRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { RecordOrganizationSwitchOffer } from "@/features/organizations/components/RecordOrganizationSwitchOffer";

interface DirectAgentChatPageProps {
  params: Promise<{ agentId: string }>;
}

/**
 * Resolves just the agent's display name — single-column query so first paint
 * has a real label for the picker without forcing the full agent fetch on the
 * server. Returns `null` on missing/RLS-denied; the client renders "Select an
 * agent" in that case (rare — usually means the link is stale).
 */
async function resolveAgent(
  agentId: string,
): Promise<{ name: string | null; organizationId: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("name,organization_id")
    .is("deleted_at", null)
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    name: (data.name as string | null) ?? null,
    organizationId: data.organization_id ?? null,
  };
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
  const agent = await resolveAgent(agentId);
  const agentName = agent?.name ?? null;
  return (
    <>
      <PageHeader>
        <ChatRunHeader
          activeAgentId={agentId}
          initialAgentName={agentName ?? undefined}
        />
      </PageHeader>
      {/* The first message starts a conversation that lands its work and cost
          in an organization: the one offer names the AGENT'S own organization
          above the composer when it is not the selected one (or none is). */}
      <ChatRoomClient
        agentId={agentId}
        aboveInput={
          <RecordOrganizationSwitchOffer
            organizationId={agent?.organizationId}
            what="agent"
            className="mb-2"
          />
        }
      />
    </>
  );
}
