import { getAgent } from "@/lib/agents/data";
import { AgentHydrator } from "./AgentHydrator";

/**
 * Server Component that fetches the agent and passes it to the client hydrator.
 * Intended to be rendered inside a <Suspense> boundary in the layout so the
 * header shell renders immediately while the DB fetch streams in the background.
 */
export async function AgentHydratorServer({ agentId }: { agentId: string }) {
  const agent = await getAgent(agentId);
  // A null read (denied / deleted / never existed / session expired) seeds
  // nothing — the route body renders the honest answer via <AccessGate>.
  if (!agent) return null;
  return <AgentHydrator definition={agent} />;
}
