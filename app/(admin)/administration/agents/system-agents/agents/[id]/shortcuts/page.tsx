import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentShortcutsPanel } from "@/features/agents/components/shortcuts/AgentShortcutsPanel";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export const metadata = { title: "Shortcuts | System Agents" };

const ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";

export default async function AdminSystemAgentShortcutsPage({
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
      <div className="h-full overflow-y-auto pt-12">
        <AgentShortcutsPanel
          agentId={id}
          agentName={agent.name}
          basePath={ADMIN_BASE_PATH}
          agentDescription={agent.description}
          agentVariableDefinitions={agent.variableDefinitions ?? []}
          // System agents get system shortcuts — the admin surface writes
          // global, not into the acting admin's personal scope.
          linkScope="global"
        />
      </div>
    </>
  );
}
