import { Suspense } from "react";

import { getAgent } from "@/lib/agents/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { ImprovementWorkspace } from "@/features/hindsight/workspace/ImprovementWorkspace";

export default async function AgentHindsightRoute({
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
      <div className="h-full overflow-hidden">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/50" />}>
          <ImprovementWorkspace agentId={id} agentName={agent.name} />
        </Suspense>
      </div>
    </>
  );
}
