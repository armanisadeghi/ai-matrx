import { getAgent, getAppsForAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentAppsPanel } from "@/features/agents/components/apps/AgentAppsPanel";
import type { AgentApp } from "@/features/agent-apps/types";

export const metadata = { title: "Agent Apps | AI Matrx" };

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
        apps={apps as unknown as AgentApp[]}
      />
    </>
  );
}
