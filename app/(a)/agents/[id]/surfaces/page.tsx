import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentSurfacesPanel } from "@/features/agents/components/surfaces/AgentSurfacesPanel";

export const metadata = {
  title: "Agent Surfaces | AI Matrx",
  description:
    "Bind this agent to UI surfaces and configure how surface-provided values map to its variables and context slots.",
};

export default async function AgentSurfacesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <AgentSurfacesPanel agent={agent} />
    </>
  );
}
