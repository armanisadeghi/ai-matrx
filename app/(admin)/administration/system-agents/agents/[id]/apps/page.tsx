import { getAgent, getAppsForAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentAppsPanel } from "@/features/agents/components/apps/AgentAppsPanel";
import type { AgentApp } from "@/features/agent-apps/types";

export const metadata = { title: "Apps | System Agents" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentAppsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [agent, apps] = await Promise.all([getAgent(id), getAppsForAgent(id)]);

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
        <AgentAppsPanel
          agentId={id}
          agentName={agent.name}
          apps={apps as unknown as AgentApp[]}
        />
      </div>
    </div>
  );
}
