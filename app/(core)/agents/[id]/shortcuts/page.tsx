import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AgentShortcutsPanel } from "@/features/agents/components/shortcuts/AgentShortcutsPanel";

export const metadata = { title: "Agent Shortcuts | AI Matrx" };

export default async function AgentShortcutsRoute({
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
      <AgentShortcutsPanel agentId={id} agentName={agent.name} />
    </>
  );
}
