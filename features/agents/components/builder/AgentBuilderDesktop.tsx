import { Suspense } from "react";
import { AgentBuilderLeftPanel } from "./AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "./AgentBuilderRightPanel";
import { AgentBuilderReadOnlyFrame } from "./AgentBuilderReadOnlyFrame";
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
        <AgentBuilderReadOnlyFrame agentId={agentId} className="h-full">
          <AgentBuilderLeftPanel agentId={agentId} />
        </AgentBuilderReadOnlyFrame>
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden flex justify-center">
        {/* No top padding: the conversation column's scroll area already
            clears the shell header itself. Bottom padding matches the left
            panel's footer gap (the column only pads when width-constrained). */}
        <div className="w-full max-w-3xl h-full pb-2">
          <Suspense fallback={<RightPanelSkeleton />}>
            <AgentBuilderRightPanel agentId={agentId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
