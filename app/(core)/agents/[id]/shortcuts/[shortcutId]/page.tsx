import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { ShortcutEditorNext } from "@/features/agent-shortcuts/components/next/ShortcutEditorNext";
import { AccessGate } from "@/features/access-gate/components/AccessGate";


export default async function AgentEditShortcutRoute({
  params,
}: {
  params: Promise<{ id: string; shortcutId: string }>;
}) {
  const { id, shortcutId } = await params;
  const agent = await getAgent(id);

  // A null read is ambiguous under RLS (denied / deleted / never existed /
  // session expired) — the gate asks the platform which one it actually is
  // instead of a generic 404.
  if (!agent) {
    return (
      <AccessGate
        token="agent"
        id={id}
        fallbackHref="/agents"
        fallbackLabel="All agents"
      />
    );
  }

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <ShortcutEditorNext agent={agent} shortcutId={shortcutId} />
    </>
  );
}
