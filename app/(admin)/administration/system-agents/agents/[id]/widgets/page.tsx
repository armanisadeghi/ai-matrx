import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentWidgetsPage } from "@/features/agents/components/widgets/AgentWidgetsPage";

export const metadata = { title: "Widgets | System Agents" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentWidgetsPage({
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
      <div className="h-full overflow-hidden">
        <AgentWidgetsPage agentId={id} initialAgentName={agent.name} />
      </div>
    </>
  );
}
