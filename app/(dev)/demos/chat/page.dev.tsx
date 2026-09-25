// app/(dev)/demos/chat/page.tsx — Root chat route (default agent welcome screen).

import ChatHeaderControls from "@/features/cx-chat/components/ChatHeaderControls";
import ChatWelcomeServer from "@/features/cx-chat/components/ChatWelcomeServer";
import {
  CX_DEFAULT_MANDATE_KEY,
  getDefaultAgent,
  resolveAgentForSSR,
} from "@/features/cx-chat/components/agent/agents";
import { FastPathMandateGuard } from "@/features/mandates/FastPathMandateGuard";
import { resolveMandateSeed } from "@/features/mandates/seed.server";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { warmAgent } from "@/lib/api/warm-helpers";

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

  warmAgent(agent.promptId, { baseUrl: BACKEND_URLS.production ?? "" });

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
