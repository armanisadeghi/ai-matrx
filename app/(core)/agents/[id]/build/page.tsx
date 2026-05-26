import { getAgent } from "@/lib/agents/data";
import { AgentBuilderPage } from "@/features/agents/components/builder/AgentBuilderPage";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";

export const metadata = { title: "Agent Builder | AI Matrx" };

export default async function AgentEditPage({
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
      <AgentBuilderPage agentId={id} />
    </>
  );
}
