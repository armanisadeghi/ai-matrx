// app/(dev)/demos/chat/a/[agentId]/page.tsx — Agent welcome screen.

import ChatHeaderControls from "@ai-matrx/chat/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@ai-matrx/chat/cx-chat/components/ChatWelcomeServer";
import { resolveAgentForSSR } from "@ai-matrx/chat/cx-chat/components/agent/agents";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const agent = resolveAgentForSSR(agentId);


  return (
    <>
      <ChatHeaderControls />
      <ChatWelcomeServer agent={agent} />
    </>
  );
}
