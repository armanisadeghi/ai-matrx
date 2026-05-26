import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { ShortcutEditorNext } from "@/features/agent-shortcuts/components/next/ShortcutEditorNext";

export const metadata = { title: "Edit Shortcut | AI Matrx" };

export default async function AgentEditShortcutRoute({
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
      <ShortcutEditorNext agent={agent} shortcutId={shortcutId} />
    </>
  );
}
