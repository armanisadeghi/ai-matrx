import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentShortcutEditor } from "@/features/agents/components/shortcuts/AgentShortcutEditor";

export const metadata = { title: "New Shortcut (Classic) | AI Matrx" };

export default async function AgentNewShortcutLegacyRoute({
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
      <AgentShortcutEditor
        agentId={id}
        agentName={agent.name}
        shortcutId="new"
      />
    </>
  );
}
