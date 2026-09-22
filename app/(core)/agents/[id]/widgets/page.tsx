import { getAgent } from "@/lib/agents/data";
import { AgentWidgetsPage } from "@/features/agents/components/widgets/AgentWidgetsPage";
import { AccessGate } from "@/features/access-gate/components/AccessGate";


export default async function AgentWidgetsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  // A null read is ambiguous under RLS (denied / deleted / never existed /
  // session expired) — the gate asks the platform which one it actually is
  // instead of a generic 404.
  if (!agent) {
    return (
      <AccessGate
        token="agent"
        id={id}
        fallbackHref="/agents"
        fallbackLabel="All agents"
      />
    );
  }

  return <AgentWidgetsPage agentId={id} initialAgentName={agent.name} />;
}
