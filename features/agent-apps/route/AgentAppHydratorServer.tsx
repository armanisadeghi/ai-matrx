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
import { AgentAppHydrator } from "./AgentAppHydrator";

export async function AgentAppHydratorServer({
  appId,
}: {
  appId: string;
}) {
  const app = await getAgentApp(appId);
  return <AgentAppHydrator app={app} />;
}
