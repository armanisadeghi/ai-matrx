import { getAgent } from "@/lib/agents/data";
import { AgentViewContent } from "@/features/agents/route/AgentViewContent";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";

export const metadata = { title: "View" };

export default async function AgentViewPage({
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
      <AgentViewContent agentId={id} />
    </>
  );
}
