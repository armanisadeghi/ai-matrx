// app/(ssr)/ssr/chat/page.tsx — Root chat route (default agent welcome screen).

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@/features/cx-chat/components/ChatWelcomeServer";
import { getDefaultAgent } from "@/features/cx-chat/components/agent/agents";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { warmAgent } from "@/lib/api/warm-helpers";

export default async function ChatPage() {
  const agent = getDefaultAgent();

  warmAgent(agent.promptId, { baseUrl: BACKEND_URLS.production ?? "" });

  return (
    <>
      <ChatHeaderControls />
      <ChatWelcomeServer agent={agent} />
    </>
  );
}
