import { getAgent } from "@/lib/agents/data";
import { AgentWidgetsPage } from "@/features/agents/components/widgets/AgentWidgetsPage";

export const metadata = { title: "Agent Widgets | AI Matrx" };

export default async function AgentWidgetsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  return <AgentWidgetsPage agentId={id} initialAgentName={agent.name} />;
}
