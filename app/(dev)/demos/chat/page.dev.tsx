// app/(dev)/demos/chat/page.tsx — Root chat route (default agent welcome screen).

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@/features/cx-chat/components/ChatWelcomeServer";
import {
  CX_DEFAULT_SLOT_KEY,
  getDefaultAgent,
  resolveAgentForSSR,
} from "@/features/cx-chat/components/agent/agents";
import { resolveAgentSlotServer } from "@/features/agents/slots/service.server";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { warmAgent } from "@/lib/api/warm-helpers";

export default async function ChatPage() {
  // The default cx-chat agent is the `chat.cx_default` slot — the user's own
  // binding wins over the system default. `resolveAgentForSSR` still serves
  // hardcoded display data for known builtins and a stub (client-hydrated)
  // for anything else. A resolution failure on this dev demo screams and
  // falls back to the seed-mirror agent rather than 500ing the page.
  let agent;
  try {
    const resolved = await resolveAgentSlotServer(CX_DEFAULT_SLOT_KEY);
    agent = resolveAgentForSSR(resolved.agentId);
  } catch (error) {
    console.error(
      `[demos/chat] slot "${CX_DEFAULT_SLOT_KEY}" failed to resolve — using the seed mirror:`,
      error,
    );
    agent = getDefaultAgent();
  }

  warmAgent(agent.promptId, { baseUrl: BACKEND_URLS.production ?? "" });

  return (
    <>
      <ChatHeaderControls />
      <ChatWelcomeServer agent={agent} />
    </>
  );
}
