import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import {
  ChatNewClient,
  ChatNewLandingSkeleton,
} from "@/features/agents/components/chat/ChatNewClient";
import { ChatNewHeader } from "@/features/agents/components/chat/ChatNewHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  DEFAULT_NEW_CHAT_MANDATE_KEY,
  PRIMARY_QUICK_ACTIONS,
  SECONDARY_QUICK_ACTIONS,
} from "@/features/agents/components/chat/chat-quick-actions.config";
import { resolveMandateServer } from "@/features/agents/mandates/service.server";
import { PageAgents } from "@/components/agents/PageAgents";

/**
 * SSR mandate resolution: which agent owns `/chat/new` for THIS user (system
 * default → their own `chat.default_new_chat` binding). Resolving here means
 * the header and input bar mount the right agent with no client flash. On a
 * resolution failure we SCREAM server-side and return null — the client then
 * re-attempts through the one client resolver and surfaces its loud error
 * state; there is no hardcoded-agent fallback.
 */
async function resolveDefaultChatAgentId(): Promise<string | null> {
  try {
    const resolved = await resolveMandateServer(DEFAULT_NEW_CHAT_MANDATE_KEY);
    return resolved.agentId;
  } catch (error) {
    console.error(
      `[chat/new] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve at SSR — deferring to client resolution:`,
      error,
    );
    return null;
  }
}

/**
 * Single-column SSR lookup for the default agent's display name so the chat
 * picker bar has a real label on first paint (instead of the bare placeholder
 * or a "loading" flicker). The lazy `AgentListDropdown` still defers its full
 * fetch until the user actually clicks the picker.
 */
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
  return data.name ?? null;
}

const CHAT_NEW_PAGE_AGENTS = [
  {
    mandateKey: DEFAULT_NEW_CHAT_MANDATE_KEY,
    does: "answers the open conversation",
  },
  ...PRIMARY_QUICK_ACTIONS,
  ...SECONDARY_QUICK_ACTIONS,
].map(({ mandateKey, does }) => ({ mandateKey, does }));

export default async function NewChatPage() {
  const agentId = await resolveDefaultChatAgentId();
  const defaultAgentName = agentId ? await resolveAgentName(agentId) : null;
  return (
    <>
      <PageHeader>
        <ChatNewHeader
          agentId={agentId}
          initialAgentName={defaultAgentName ?? undefined}
        />
      </PageHeader>
      <Suspense fallback={<ChatNewLandingSkeleton />}>
        <ChatNewClient
          agentId={agentId}
          agentDisclosure={
            <PageAgents
              agents={CHAT_NEW_PAGE_AGENTS}
              surfaceName="matrx-user/chat"
            />
          }
        />
      </Suspense>
      {/* No conversion nudge here: the send gate is gone (guests send for
          real), so gate-attempt-driven nudges can never fire on this page. */}
    </>
  );
}
