import { Suspense } from "react";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";
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
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center rounded-md bg-muted/50">
              <SuspenseLoader
                centered={false}
                message="Loading hindsight workspace…"
              />
            </div>
          }
        >
          <ImprovementWorkspace agentId={id} agentName={agent.name} />
        </Suspense>
      </div>
    </>
  );
}
