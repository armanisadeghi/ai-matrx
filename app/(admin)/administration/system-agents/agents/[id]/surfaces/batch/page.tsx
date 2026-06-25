import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { SurfaceBindingsBatchEditor } from "@/features/surfaces/admin/batch/SurfaceBindingsBatchEditor";

export const metadata = { title: "Batch Surface Bindings | System Agents" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentBatchSurfacesPage({
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
      <SurfaceBindingsBatchEditor agent={agent} basePath={ADMIN_BASE_PATH} />
    </>
  );
}
