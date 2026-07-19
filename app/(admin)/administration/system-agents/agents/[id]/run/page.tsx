import { getAgent } from "@/lib/agents/data";
import { AgentRunnerPage } from "@/features/agents/components/run/AgentRunnerPage";
import { AgentRunHeader } from "@/features/agents/components/run/AgentRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";

export const metadata = { title: "System Agent Runner | Admin" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  const sourceFeature = "agent-runner";
  const surfaceKey = `${sourceFeature}:${id}`;

  return (
    <>
      <PageHeader>
        <AgentRunHeader
          agentId={id}
          agentName={agent.name}
          surfaceKey={surfaceKey}
          backHref={ADMIN_BASE_PATH}
          basePath={ADMIN_BASE_PATH}
          currentPath={`${ADMIN_BASE_PATH}/[id]/run`}
        />
      </PageHeader>
      <AgentRunnerPage
        agentId={id}
        sourceFeature={sourceFeature}
        surfaceKey={surfaceKey}
        backHref={ADMIN_BASE_PATH}
        basePath={ADMIN_BASE_PATH}
      />
    </>
  );
}
