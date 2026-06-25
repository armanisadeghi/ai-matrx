import { getAgent, getAppsForAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
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
        <AgentAppsPanel
          agentId={id}
          agentName={agent.name}
          apps={apps as unknown as AgentApp[]}
        />
      </div>
    </>
  );
}
