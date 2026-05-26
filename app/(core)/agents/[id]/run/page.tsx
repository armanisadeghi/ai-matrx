import { getAgent } from "@/lib/agents/data";
import { AgentRunnerPage } from "@/features/agents/components/run/AgentRunnerPage";
import { AgentRunHeader } from "@/features/agents/components/run/AgentRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";

export const metadata = { title: "Agent Runner | AI Matrx" };

export default async function AgentRunRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  const sourceFeature = "agent-runner";
  const surfaceKey = `${sourceFeature}:${id}`;
  const agentName = agent.name;
  const backHref = "/agents";
  const basePath = "/agents";
  const currentPath = "/agents/[id]/run";

  return (
    <>
      <PageHeader>
        <AgentRunHeader
          agentId={id}
          agentName={agentName}
          surfaceKey={surfaceKey}
          backHref={backHref}
          basePath={basePath}
          currentPath={currentPath}
        />
      </PageHeader>
      <AgentRunnerPage agentId={id} />
    </>
  );
}
