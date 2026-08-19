import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
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
            <div className="flex h-full gap-3 p-4 pt-[calc(var(--shell-header-h)+1rem)]">
              <Skeleton className="hidden h-full w-64 2xl:block" />
              <Skeleton className="h-full flex-1" />
              <Skeleton className="hidden h-full w-[26rem] 2xl:block" />
            </div>
          }
        >
          <ImprovementWorkspace agentId={id} agentName={agent.name} />
        </Suspense>
      </div>
    </>
  );
}
