import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { CalibrationView } from "@/features/agents/decision-review/components/CalibrationView";

export default async function AgentAnswersCalibrationRoute({
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
      <div className="h-full overflow-hidden">
        <CalibrationView agentId={id} />
      </div>
    </>
  );
}
