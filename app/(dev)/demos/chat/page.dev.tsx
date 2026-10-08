// app/(dev)/demos/chat/page.tsx — Root chat route (default agent welcome screen).

import ChatHeaderControls from "@ai-matrx/chat/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@ai-matrx/chat/cx-chat/components/ChatWelcomeServer";
import {
  CX_DEFAULT_MANDATE_KEY,
  getDefaultAgent,
  resolveAgentForSSR,
} from "@ai-matrx/chat/cx-chat/components/agent/agents";
import { FastPathMandateGuard } from "@ai-matrx/chat/mandates/FastPathMandateGuard";
import { resolveMandateSeed } from "@/features/mandates/seed.server";

export default async function ChatPage() {
  // The default cx-chat agent is the `chat.cx_default` mandate — the user's own
  // binding wins over the system default. `resolveAgentForSSR` still serves
  // hardcoded display data for known builtins and a stub (client-hydrated)
  // for anything else. A resolution failure on this dev demo screams and
  // falls back to the seed-mirror agent rather than 500ing the page.
  // BOUNDED — see seed.server.ts.
  const seed = await resolveMandateSeed(CX_DEFAULT_MANDATE_KEY);
  const agent = seed.agentId
    ? resolveAgentForSSR(seed.agentId)
    : getDefaultAgent();


  return (
    <>
      <ChatHeaderControls />
      {/* The seed-mirror fallback ran without a resolved Mandate — the browser
          re-asks `chat.cx_default` and screams to admins on a mismatch. */}
      {seed.agentId ? null : (
        <FastPathMandateGuard
          mandateKey={CX_DEFAULT_MANDATE_KEY}
          hardcodedAgentId={agent.promptId}
          surface="app/(dev)/demos/chat/page.dev.tsx (SSR seed fallback)"
        />
      )}
      <ChatWelcomeServer agent={agent} />
    </>
  );
}
