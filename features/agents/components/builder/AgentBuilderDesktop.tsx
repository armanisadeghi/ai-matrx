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
    <div className="h-full overflow-hidden bg-textured p-2 sm:p-3">
      <div className="grid h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(0,0.95fr)_minmax(26rem,1.15fr)]">
        <section
          aria-labelledby="agent-builder-configure-heading"
          className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:border-r lg:border-b-0"
        >
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
            <p
              id="agent-builder-configure-heading"
              className="text-sm font-semibold text-foreground"
            >
              Configure
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Define how this agent thinks, what it knows, and the inputs it
              needs.
            </p>
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <AgentBuilderReadOnlyFrame agentId={agentId} className="h-full">
              <AgentBuilderLeftPanel agentId={agentId} />
            </AgentBuilderReadOnlyFrame>
          </div>
        </section>

        <section
          aria-labelledby="agent-builder-test-heading"
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
            <p
              id="agent-builder-test-heading"
              className="text-sm font-semibold text-foreground"
            >
              Test
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Try the current draft before you save a version.
            </p>
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <Suspense fallback={<RightPanelSkeleton />}>
              <AgentBuilderRightPanel agentId={agentId} />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
