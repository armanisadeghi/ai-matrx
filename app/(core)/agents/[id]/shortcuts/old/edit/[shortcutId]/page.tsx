import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentShortcutEditor } from "@/features/agents/components/shortcuts/AgentShortcutEditor";


// Legacy editor — preserved verbatim while the new editor settles in. Hop
// here only when something the new flow doesn't yet expose is needed.
export default async function AgentEditShortcutLegacyRoute({
  params,
}: {
  params: Promise<{ id: string; shortcutId: string }>;
}) {
  const { id, shortcutId } = await params;
  const agent = await getAgent(id);

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <AgentShortcutEditor
        agentId={id}
        agentName={agent.name}
        shortcutId={shortcutId}
      />
    </>
  );
}
