import { Suspense } from "react";
import { AgentBuilderLeftPanel } from "./AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "./AgentBuilderRightPanel";
import { RightPanelSkeleton } from "./AgentBuilderSkeletons";

interface AgentBuilderDesktopProps {
  agentId: string;
}

export function AgentBuilderDesktop({ agentId }: AgentBuilderDesktopProps) {
  return (
    <div className="flex h-full">
      <div
        className="flex-1 min-w-0 h-full overflow-hidden max-w-[640px] px-2"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <AgentBuilderLeftPanel agentId={agentId} />
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden flex justify-center">
        <div className="w-full max-w-3xl h-full pt-12">
          <Suspense fallback={<RightPanelSkeleton />}>
            <AgentBuilderRightPanel agentId={agentId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
