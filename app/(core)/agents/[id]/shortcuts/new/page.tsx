import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { ShortcutEditorNext } from "@/features/agent-shortcuts/components/next/ShortcutEditorNext";


export default async function AgentNewShortcutRoute({
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
      <ShortcutEditorNext agent={agent} shortcutId="new" />
    </>
  );
}
