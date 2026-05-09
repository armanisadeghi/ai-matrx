/**
 * AgentAppHydratorServer
 *
 * Server Component that fetches the app row and hands it to the client
 * hydrator. Intended to live inside the [id] layout so every sub-route
 * (overview, code, versions, settings, run, etc.) gets a consistent
 * Redux-seeded view of the app without re-fetching.
 *
 * Mirrors features/agents/route/AgentHydratorServer.tsx.
 */

import { getAgentApp } from "@/lib/agent-apps/data";
import { getAgent } from "@/lib/agents/data";
import { AgentAppHydrator } from "./AgentAppHydrator";
import { AgentHydrator } from "@/features/agents/route/AgentHydrator";

/**
 * Server-component layout helper. Fetches the app row, plus the live
 * agent definition that powers it, and hands both to client hydrators.
 *
 * Why both: every sub-route under /agent-apps/[id] needs the agent's
 * variableDefinitions / contextSlots / settings to render the management
 * UI (variables card, version picker, etc). Resolving on the server here
 * avoids a client-side fetch waterfall and means selectAgentById can
 * return real data on first paint.
 *
 * Version-pinned apps still hydrate the LIVE agent today — the variables
 * card on the overview shows live data with a "pinned to v{n}; may
 * differ" note. A separate fetch path that resolves the version snapshot
 * lands later.
 */
export async function AgentAppHydratorServer({
  appId,
}: {
  appId: string;
}) {
  const app = await getAgentApp(appId);
  const agent = await getAgent(app.agent_id).catch(() => null);
  return (
    <>
      <AgentAppHydrator app={app} />
      {agent && <AgentHydrator definition={agent} />}
    </>
  );
}
