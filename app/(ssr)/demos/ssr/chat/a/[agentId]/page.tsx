// app/(ssr)/ssr/chat/a/[agentId]/page.tsx — Agent welcome screen.

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@/features/cx-chat/components/ChatWelcomeServer";
import { resolveAgentForSSR } from "@/features/cx-chat/components/agent/agents";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { warmAgent } from "@/lib/api/warm-helpers";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const agent = resolveAgentForSSR(agentId);

  warmAgent(agentId, { baseUrl: BACKEND_URLS.production ?? "" });

  return (
    <>
      <ChatHeaderControls />
      <ChatWelcomeServer agent={agent} />
    </>
  );
}
