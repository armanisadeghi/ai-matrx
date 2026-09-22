import { getAgent } from "@/lib/agents/data";
import { AgentRunnerPage } from "@/features/agents/components/run/AgentRunnerPage";
import { AgentRunHeader } from "@/features/agents/components/run/AgentRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export const metadata = { title: "System Agent Runner | Admin" };

const ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";

export default async function AdminSystemAgentRunPage({
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
        fallbackHref="/administration/agents/system-agents"
        fallbackLabel="System agents"
      />
    );
  }
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
