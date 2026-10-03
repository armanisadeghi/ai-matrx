import { getAgent } from "@/lib/agents/data";
import { AgentBuilderPage } from "@/features/agents/components/builder/AgentBuilderPage";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@ai-matrx/chat/agents/components/shared/AgentHeader";
import { AgentHydratorServer } from "@ai-matrx/chat/agents/route/AgentHydratorServer";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { BuilderProposalFrame } from "./_components/BuilderProposalFrame";

/** The agent the owner named (2026-10-03). `?id=<agentId>` opens any other. */
const DEFAULT_AGENT_ID = "506a20fc-34a9-4038-b38b-6c71ab09b173";

/**
 * Sample: /agents/[id]/build — a demo COPY. The owner forbids changes to the
 * real builder without his explicit approval, so this page imports the REAL
 * builder (`AgentBuilderPage`, `AgentHeader`, `AgentHydratorServer`) exactly
 * as `app/(core)/agents/[id]/build/page.tsx` + its layout mount them, and edits
 * no builder file. The proposals live in `BuilderProposalFrame`: a list, and
 * an opt-in preview that applies them as scoped CSS around the real builder.
 */
export default async function AgentBuilderSamplePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id: requested } = await searchParams;
  const id = requested && /^[0-9a-f-]{36}$/i.test(requested) ? requested : DEFAULT_AGENT_ID;
  const agent = await getAgent(id);

  if (!agent) {
    return <AccessGate token="agent" id={id} fallbackHref="/agents" fallbackLabel="All agents" />;
  }

  return (
    <>
      <AgentHydratorServer agentId={id} />
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <BuilderProposalFrame realHref={`/agents/${id}/build`}>
        <AgentBuilderPage agentId={id} />
      </BuilderProposalFrame>
    </>
  );
}
