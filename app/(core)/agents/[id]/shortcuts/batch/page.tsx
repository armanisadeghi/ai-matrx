import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { BatchShortcutsEditor } from "@/features/agent-shortcuts/components/batch/BatchShortcutsEditor";

export default async function AgentBatchShortcutsRoute({
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
      <BatchShortcutsEditor agent={agent} />
    </>
  );
}
