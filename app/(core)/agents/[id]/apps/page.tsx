import { getAgent, getAppsForAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentAppsPanel } from "@/features/agents/components/apps/AgentAppsPanel";
import { AccessGate } from "@/features/access-gate/components/AccessGate";


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

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <div className="h-full pt-[var(--shell-header-h)]">
        <AgentAppsPanel
          agentId={id}
          agentName={agent.name}
          apps={apps}
        />
      </div>
    </>
  );
}
