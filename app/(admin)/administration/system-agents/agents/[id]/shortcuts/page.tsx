import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 h-10 px-4 border-b border-border bg-card flex items-center">
        <AgentHeader
          agentId={id}
          agentName={agent.name}
          backHref={ADMIN_BASE_PATH}
          basePath={ADMIN_BASE_PATH}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <AgentShortcutsPanel
          agentId={id}
          agentName={agent.name}
          basePath={ADMIN_BASE_PATH}
        />
      </div>
    </div>
  );
}
