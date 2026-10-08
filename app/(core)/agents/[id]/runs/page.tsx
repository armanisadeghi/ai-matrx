import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@ai-matrx/chat/agents/components/shared/AgentHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { RunsTable } from "@/features/mandates/run-history/RunsTable";

// Every run of this agent — through any mandate or used directly — on the one
// shared runs table. A user page: the viewer's own runs (the admin seat never
// widens a user page).
export default async function AgentRunsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) {
    return <AccessGate token="agent" id={id} fallbackHref="/agents" fallbackLabel="All agents" />;
  }
  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <div className="h-full overflow-y-auto px-4 pb-4 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <RunsTable scope={{ agentId: id }} view="mine" audience="product" urlId="agent-runs" />
      </div>
    </>
  );
}
