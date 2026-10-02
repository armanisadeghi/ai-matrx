// app/(dev)/demos/chat/a/[agentId]/page.tsx — Agent welcome screen.

import ChatHeaderControls from "@ai-matrx/chat/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@ai-matrx/chat/cx-chat/components/ChatWelcomeServer";
import { resolveAgentForSSR } from "@ai-matrx/chat/cx-chat/components/agent/agents";
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
