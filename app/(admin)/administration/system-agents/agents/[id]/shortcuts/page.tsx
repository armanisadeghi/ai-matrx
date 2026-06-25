import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentShortcutsPanel } from "@/features/agents/components/shortcuts/AgentShortcutsPanel";

export const metadata = { title: "Shortcuts | System Agents" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentShortcutsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

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
      <div className="h-full overflow-y-auto">
        <AgentShortcutsPanel
          agentId={id}
          agentName={agent.name}
          basePath={ADMIN_BASE_PATH}
        />
      </div>
    </>
  );
}
