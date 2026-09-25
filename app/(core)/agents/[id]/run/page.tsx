import { getAgent } from "@/lib/agents/data";
import { AgentRunnerPage } from "@/features/agents/components/run/AgentRunnerPage";
import { AgentRunHeader } from "@/features/agents/components/run/AgentRunHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { RecordOrganizationSwitchOffer } from "@/features/organizations/components/RecordOrganizationSwitchOffer";


export default async function AgentRunRoute({
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
  const sourceFeature = "agent-runner";
  const surfaceKey = `${sourceFeature}:${id}`;
  const agentName = agent.name;
  const backHref = "/agents/all";
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
      <div className="h-full pt-[var(--shell-header-h)]">
        {/* A run lands its work and cost in an organization: when the agent
            lives in another one than the selected (or none is selected), the
            one offer names the AGENT'S organization, above the composer. */}
        <AgentRunnerPage
          agentId={id}
          aboveInput={
            <RecordOrganizationSwitchOffer
              organizationId={agent.organizationId}
              what="agent"
              className="mb-2"
            />
          }
        />
      </div>
    </>
  );
}
