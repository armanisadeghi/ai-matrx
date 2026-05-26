import { getAgent } from "@/lib/agents/data";
import { AgentViewContent } from "@/features/agents/route/AgentViewContent";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";

export const metadata = { title: "View | System Agents" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentViewPage({
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
        <AgentViewContent agentId={id} />
      </div>
    </div>
  );
}
