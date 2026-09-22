import { getAgent } from "@/lib/agents/data";
import { AgentViewContent } from "@/features/agents/route/AgentViewContent";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { SystemAgentWriteTargets } from "@/features/agents/components/admin/SystemAgentWriteTargets";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export const metadata = { title: "View | System Agents" };

const ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";

export default async function AdminSystemAgentViewPage({
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

  return (
    <>
      <PageHeader>
        <AgentHeader
          agentId={id}
          agentName={agent.name}
          backHref={ADMIN_BASE_PATH}
          basePath={ADMIN_BASE_PATH}
        />
      </PageHeader>
      {/*
        Registers the `matrx-admin/system-agents` write handlers against the
        surface the route layout already provides. Mounted HERE and not in the
        layout on purpose: the sibling /build route nests the agent-builder
        surface, which owns these same four target names as draft targets.
      */}
      <SystemAgentWriteTargets agentId={id} />
      <div className="h-full overflow-y-auto">
        <AgentViewContent agentId={id} />
      </div>
    </>
  );
}
