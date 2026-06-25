import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { SurfaceBindingsBatchEditor } from "@/features/surfaces/admin/batch/SurfaceBindingsBatchEditor";

export default async function AgentBatchSurfacesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <SurfaceBindingsBatchEditor agent={agent} basePath="/agents" />
    </>
  );
}
