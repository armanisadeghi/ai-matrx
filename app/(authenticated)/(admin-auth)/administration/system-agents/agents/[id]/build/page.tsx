import { getAgent } from "@/lib/agents/data";
import { AgentBuilderPage } from "@/features/agents/components/builder/AgentBuilderPage";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";

export const metadata = { title: "System Agent Builder | Admin" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentBuildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <AgentHeader
        agentId={id}
        agentName={agent.name}
        backHref={ADMIN_BASE_PATH}
        basePath={ADMIN_BASE_PATH}
      />
      <div className="flex-1 overflow-hidden">
        <AgentBuilderPage agentId={id} />
      </div>
    </div>
  );
}
