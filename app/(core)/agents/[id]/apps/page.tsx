import { getAgent, getAppsForAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentAppsPanel } from "@/features/agents/components/apps/AgentAppsPanel";


export default async function AgentAppsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [agent, apps] = await Promise.all([
    getAgent(id),
    getAppsForAgent(id),
  ]);

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <AgentAppsPanel
        agentId={id}
        agentName={agent.name}
        apps={apps}
      />
    </>
  );
}
